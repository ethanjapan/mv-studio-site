# -*- coding: utf-8 -*-
r"""新しい作品をサイトに載せる素材を1回で作る(2026-10-14 新設・ユーザー「棚卸ししてね…共通化」)

## なぜ
作品を足すたびに、前回の作業フォルダ(_site_bg/<作品>_サイト更新_<日付>/)から make_vt.py / make_og.py をコピーし、
ループの ffmpeg を会話の中で打ち直していた(九月のピアノ → いつもの顔 → 水鏡 で3回)。値の打ち間違いと、
カットの継ぎ目をまたいだループ(画が途中で切り替わる)を防ぐために1本にまとめる。

## 正本流用 (#32 差分全列挙)
- 縦題= `_site_bg/いつもの顔_サイト更新_20261012/make_vt.py`(九月のピアノ版 verbatim)の plate() を verbatim
- OG= 同 `make_og.py` を verbatim(背景の切り出しだけ引数にした)
- ループ= いつもの顔(66d05be)の ffmpeg 行を verbatim(1280x720・96 コマ・crf 26 ヒーロー / 24 作品カード・音なし・faststart・JPEG q3)
差分:
  1. 縦長の本編(3840x2176 等)は中央の 16:9 を切る(いつもの顔/水鏡は crop=3840:2160:0:8 を手で書いていた)
  2. 切り出した 96 コマの中にカットの継ぎ目が無いかを scdet で数え、あれば止める(水鏡で手で測っていた)。
     ディゾルブは scdet で拾えない= 出来た mp4 は目で見る
  3. 出力名は作品の id(slug)と縦題の略号(abbr)から決める(links.html の参照名と同じ)

## 使い方(素材は**題字・歌詞の焼き込みが無い**本編から切る= 重ね前の 4K 本編)
  python3 tools/new_work_assets.py --src <4K本編.mp4> --slug mizukagami --abbr mzk \
      --hero 4866 --og 2851 --title-ja 水鏡 --title-zh 水鏡 --out <作業フォルダ> [--card 2836]
  --hero/--card/--og は本編のコマ番号(24fps)。--card を省くと作品カードの動画は作らない(公式サイト側で作った wk_<slug> を使う時)
出力: lk_loop_<slug>.mp4 / lk_poster_<slug>.jpg / [wk_<slug>.mp4 / wk_<slug>.jpg] / lk_ja_<abbr>.png / lk_tw_<abbr>.png / og_base.jpg / og_links.jpg / contact.jpg(確認用)
置き先と書き換える所は README の「作品を足す」。
"""
import argparse
import os
import random
import re
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONTS = os.path.expanduser("~/Library/Fonts")
NF = 96   # 4.0 秒。カットが4秒台の作品(いつもの顔)でも継ぎ目をまたがない長さ


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"[ERR] {' '.join(cmd[:6])} …\n{r.stderr[-800:]}")
    return r.stdout + r.stderr


def probe(src):
    o = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate",
             "-of", "csv=p=0", src]).strip().split(",")
    w, h = int(o[0]), int(o[1])
    num, den = o[2].split("/")
    return w, h, float(num) / float(den)


def crop169(w, h):
    ch = w * 9 // 16
    if ch > h:
        cw = h * 16 // 9
        return f"crop={cw}:{h}:{(w - cw) // 2}:0"
    return f"crop={w}:{ch}:0:{(h - ch) // 2}"   # 差分1: 3840x2176 → 3840:2160:0:8


def seams(mp4):
    """差分2: 出来たループの中の継ぎ目(ハードカット)の数。"""
    o = run(["ffmpeg", "-nostdin", "-v", "error", "-i", mp4, "-vf", "scale=320:-2,scdet=threshold=10,metadata=print:file=-",
             "-f", "null", "-"])
    return len(re.findall(r"lavfi\.scd\.time=", o))


def loop(src, fps, crop, start, crf, out_mp4, out_jpg, poster_n):
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{start / fps:.6f}", "-i", src, "-frames:v", str(NF),
         "-vf", f"{crop},scale=1280:720:flags=lanczos,format=yuv420p", "-an", "-c:v", "libx264", "-preset", "slow",
         "-crf", str(crf), "-movflags", "+faststart", out_mp4])
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", out_mp4, "-vf", f"select=eq(n\\,{poster_n})", "-frames:v", "1",
         "-q:v", "3", out_jpg])
    n = int(run(["ffprobe", "-v", "error", "-count_packets", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0",
                 out_mp4]).strip())
    s = seams(out_mp4)
    print(f"  {os.path.basename(out_mp4)}  {n} コマ  継ぎ目 {s}  {os.path.getsize(out_mp4) // 1024} KB")
    if n != NF or s:
        sys.exit(f"[ERR] {out_mp4}: コマ数 {n}(期待 {NF})/ 継ぎ目 {s}(0 でないとループの途中で画が切り替わる= 開始コマを変える)")


# ---- 縦題(make_vt.py の plate() を verbatim)----
W, H = 288, 478
INK = (243, 239, 230)


def plate(cols, font_path, out):
    S = 4
    cw, ch = W*S, H*S
    ncol = len(cols)
    nrow = max(len(c) for c in cols)
    cell_w = cw/ncol
    cell_h = ch/nrow
    size = int(min(cell_w*0.92, cell_h*0.92))
    f = ImageFont.truetype(font_path, size)
    layer = Image.new("L", (cw, ch), 0)
    d = ImageDraw.Draw(layer)
    for ci, col in enumerate(cols):
        x = cw - (ci+0.5)*cell_w
        for ri, chx in enumerate(col):
            y = (ri+0.5)*cell_h
            d.text((x, y), chx, font=f, fill=255, anchor="mm")
    shadow = layer.filter(ImageFilter.GaussianBlur(22*S/4))
    img = Image.new("RGBA", (cw, ch), (0,0,0,0))
    sh = Image.new("RGBA", (cw, ch), (0,0,0,0))
    sh.putalpha(shadow.point(lambda v: int(v*0.72)))
    img = Image.alpha_composite(img, sh)
    rnd = random.Random(20260919)
    noise = Image.new("L", (cw//S, ch//S))
    noise.putdata([rnd.randint(228, 255) for _ in range(noise.width*noise.height)])
    noise = noise.resize((cw, ch), Image.BICUBIC)
    px = Image.merge("RGBA", (
        noise.point(lambda v: min(255, int(v*INK[0]/255))),
        noise.point(lambda v: min(255, int(v*INK[1]/255))),
        noise.point(lambda v: min(255, int(v*INK[2]/255))),
        layer))
    img = Image.alpha_composite(img, px)
    img = img.resize((W, H), Image.LANCZOS)
    img.save(out)
    print(" ", os.path.basename(out), img.size)


# ---- OG(make_og.py を verbatim・背景のパスだけ引数)----
def og(base_jpg, out):
    F = FONTS
    GOLD = (198, 160, 92)
    im = Image.open(base_jpg).convert("RGB")
    W_, H_ = im.size
    scrim = Image.new("L", (W_, H_), 0)
    d = ImageDraw.Draw(scrim)
    for x in range(W_):
        t = max(0.0, 1.0 - x / (W_ * 0.62))
        d.line([(x, 0), (x, H_)], fill=int(225 * (t ** 1.25)))
    im = Image.composite(Image.new("RGB", (W_, H_), (6, 10, 16)), im, scrim)
    bot = Image.new("L", (W_, H_), 0)
    d = ImageDraw.Draw(bot)
    for y in range(H_):
        t = max(0.0, (y - H_ * 0.7) / (H_ * 0.3))
        d.line([(0, y), (W_, y)], fill=int(90 * t))
    im = Image.composite(Image.new("RGB", (W_, H_), (6, 10, 16)), im, bot)
    d = ImageDraw.Draw(im)
    f_mark = ImageFont.truetype(f"{F}/CormorantGaramond-Light.ttf", 62)
    f_jp = ImageFont.truetype(f"{F}/ShipporiMincho-Medium.ttf", 30)
    f_sm = ImageFont.truetype("/System/Library/Fonts/Hiragino Sans GB.ttc", 19)
    d.line([(62, 432), (106, 432)], fill=GOLD, width=2)
    d.text((62, 508), "made_linlin", font=f_mark, fill=INK, anchor="ls")
    d.text((62, 560), "夜と光を、音楽のある物語に。", font=f_jp, fill=INK, anchor="ls")
    d.text((W_ - 60, 560), "MV STUDIO ・ @made_linlin", font=f_sm, fill=(168, 175, 184), anchor="rs")
    im.save(out, quality=88, optimize=True, progressive=True)
    print(" ", os.path.basename(out), im.size, os.path.getsize(out) // 1024, "KB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--slug", required=True)
    ap.add_argument("--abbr", required=True)
    ap.add_argument("--hero", type=int, required=True)
    ap.add_argument("--card", type=int)
    ap.add_argument("--og", type=int, required=True)
    ap.add_argument("--title-ja", required=True)
    ap.add_argument("--title-zh", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    w, h, fps = probe(a.src)
    crop = crop169(w, h)
    print(f"■ {a.src}  {w}x{h} {fps:g}fps  → {crop}")
    o = lambda n: os.path.join(a.out, n)
    loop(a.src, fps, crop, a.hero, 26, o(f"lk_loop_{a.slug}.mp4"), o(f"lk_poster_{a.slug}.jpg"), 0)
    if a.card is not None:
        loop(a.src, fps, crop, a.card, 24, o(f"wk_{a.slug}.mp4"), o(f"wk_{a.slug}.jpg"), 15)
    plate([a.title_ja], f"{FONTS}/YujiSyuku-Regular.ttf", o(f"lk_ja_{a.abbr}.png"))
    plate([a.title_zh], f"{FONTS}/LXGWWenKaiTC-Medium.ttf", o(f"lk_tw_{a.abbr}.png"))
    # OG は 1200x630 の比(3840 幅なら 3840x2016)で中央を切る= いつもの顔/水鏡で手で書いていた値と同じ
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{a.og / fps:.6f}", "-i", a.src, "-frames:v", "1",
         "-vf", f"crop={w}:{w * 630 // 1200}:0:{(h - w * 630 // 1200) // 2},scale=1200:630:flags=lanczos", "-q:v", "2", o("og_base.jpg")])
    og(o("og_base.jpg"), o("og_links.jpg"))
    # 確認用の一覧(ヒーローの先頭・作品カードの静止画・OG・縦題)
    tiles = [Image.open(o(f"lk_poster_{a.slug}.jpg")).resize((640, 360))]
    if a.card is not None:
        tiles.append(Image.open(o(f"wk_{a.slug}.jpg")).resize((640, 360)))
    tiles.append(Image.open(o("og_links.jpg")).resize((686, 360)))
    sheet = Image.new("RGB", (sum(t.width for t in tiles) + 2 * 230, 360), (40, 40, 40))
    x = 0
    for t in tiles:
        sheet.paste(t, (x, 0)); x += t.width
    for n in (f"lk_ja_{a.abbr}.png", f"lk_tw_{a.abbr}.png"):
        p = Image.open(o(n)).resize((216, 358)); sheet.paste(p, (x + 7, 1), p); x += 230
    sheet.save(o("contact.jpg"), quality=90)
    print(f"→ {a.out}(確認= contact.jpg とループ2本を目で)")


if __name__ == "__main__":
    main()
