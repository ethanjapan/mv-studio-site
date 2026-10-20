# -*- coding: utf-8 -*-
"""写真の枠切れ検査(2026-10-15・ユーザー「写真が切れてる。何回も指摘してるので、これルール化して」)。
枠(object-fit:cover の札・扉・冒頭の写真・使いどころ・背景の板)に入れた写真で、顔が枠の外に出ていないかを
顔検出(OpenCV YuNet)で機械的に調べ、--fix なら object-position(板は --bd-pos)を顔が入る位置に書き換える。
PC とスマホで枠の縦横比が変わる(用途の札は PC 16:10・スマホ 1:1 など)ので、両方の比で見る。

使い方(mvdirector の venv の python= cv2 が要る):
  /Users/linsuyi/mvdirector/venv/bin/python tools/face_fit.py --check   # 切れている写真を列挙して終了コード 1(lint_design.mjs が呼ぶ)
  /Users/linsuyi/mvdirector/venv/bin/python tools/face_fit.py --fix     # object-position / --bd-pos を書き換える
顔が無い写真(静物)は対象外。顔が検出できない人物写真は「未確認」として表示だけする。
枠の表(FRAMES)は css/theater.css と各頁の style の aspect-ratio から写す。枠を足したらここにも足す。
"""
import argparse
import re
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
YUNET = Path("/Users/linsuyi/mvdirector/models_aux/face_detection_yunet_2023mar.onnx")
PAGES = [p for p in sorted(list(ROOT.glob("*.html")) + list(ROOT.glob("usecases/*.html"))) if p.name != "links.html"]
# 枠の class → [(名前, PC の横/縦, スマホの横/縦)]。None= その幅では枠が無い
FRAMES = {
    "uc-card": ("用途の一覧の札", 16 / 9, 16 / 9),
    "use": ("トップの用途の札", 16 / 10, 1 / 1),
    "door": ("トップの三つの扉", 16 / 10, 16 / 11),
    "map-card": ("スタジオの中の札", 16 / 9, 2 / 1),
    "uc-film": ("冒頭の写真", 16 / 9, 16 / 9),
    "pic": ("使いどころの写真", 16 / 10, 16 / 10),
    "mc-body": None,
    "eng-step": ("つくりかたの八つの段の札", 3 / 2, 3 / 2),
    "b-skin": ("トップ 07 の肌の札", 2 / 1, 16 / 9),
    "b-eyes": ("トップ 07 の目の札", 3 / 1, 16 / 9),
    "b-mouth": ("トップ 07 の口元の札", 3 / 1, 16 / 9),
    "nx-pic": ("用途の末尾の次の用途の札", 3 / 2, 16 / 9),
    "sc-thumbs": ("スタジオの目次の札", 16 / 9, 16 / 9),
    "eng-shot": None,   # つくりかたの画面の札(人物の写真ではない・一覧の画は顔が小さい)
    "cg3": None,   # トップ 07 の顔の一貫性(縦長 3 枚を並べる枠・人が選んだ写真)
    "eng-pair": None,   # 止めた記録の見本(engineering 03)は「枠切れの前後」そのものなので検査しない
}
PLATE = ("背景の板", 1440 / 900, None)   # 板はスマホでは文字に覆われ、幅 402 では顔が入り切らないので PC の比だけ見る
MARGIN_TOP = 0.25    # 顔の高さの何倍を頭の上に残すか(額の上まで)。写真の端より外は求めない
MARGIN_SIDE = 0.15
MAIN_FACE_RATIO = 0.25   # いちばん大きい顔の面積の 25% 未満の顔(アプリ画面の中の小さな顔・背景の人)は見ない


def faces_of(path, det_cache={}):
    im = cv2.imread(str(path))
    if im is None:
        return None, None
    h, w = im.shape[:2]
    scale = 1.0
    if max(h, w) > 1600:   # 検出は長辺 1600 まで(高画素の原寸は重い)
        scale = 1600 / max(h, w)
        im = cv2.resize(im, (int(w * scale), int(h * scale)))
    det = cv2.FaceDetectorYN.create(str(YUNET), "", (im.shape[1], im.shape[0]), 0.7, 0.3, 50)
    det.setInputSize((im.shape[1], im.shape[0]))
    _, res = det.detect(im)
    out = []
    if res is not None:
        for r in res:
            x, y, fw, fh = (float(v) / scale for v in r[:4])
            out.append((x, y, fw, fh))
    if out:
        big = max(fw * fh for _, _, fw, fh in out)
        out = [f for f in out if f[2] * f[3] >= big * MAIN_FACE_RATIO]   # 主役の顔だけ
    return (w, h), out


def visible(w, h, aspect, px, py):
    """object-fit:cover で見える範囲 (x0,y0,x1,y1)。px/py は 0..1"""
    if w / h > aspect:
        vw = h * aspect; x0 = (w - vw) * px; return x0, 0, x0 + vw, h
    vh = w / aspect; y0 = (h - vh) * py; return 0, y0, w, y0 + vh


def fits(w, h, faces, aspect, px, py):
    x0, y0, x1, y1 = visible(w, h, aspect, px, py)
    for x, y, fw, fh in faces:
        top = max(0, y - fh * MARGIN_TOP); bot = min(h, y + fh * 1.0)   # 写真の端より外は求めない(顔の寄りの写真)
        lft = max(0, x - fw * MARGIN_SIDE); rgt = min(w, x + fw * (1 + MARGIN_SIDE))
        if top < y0 - 1 or bot > y1 + 1 or lft < x0 - 1 or rgt > x1 + 1:
            return False
    return True


def best_pos(w, h, faces, aspects):
    """全部の枠の比で顔が入る object-position(縦%・横%)。入る位置が無ければ None"""
    ys = [a for a in aspects if a]
    # 縦方向の候補(0..100)を総当たり。横も同じ
    for py in range(0, 101, 2):
        if all(fits(w, h, faces, a, 0.5, py / 100) for a in ys):
            return 50, py
    for px in range(0, 101, 2):
        for py in range(0, 101, 5):
            if all(fits(w, h, faces, a, px / 100, py / 100) for a in ys):
                return px, py
    return None


STYLE_RX = re.compile(r'style="([^"]*)"')


def parse_pos(style, prop):
    m = re.search(prop + r":\s*([\d.]+)%\s+([\d.]+)%", style or "")
    if m:
        return float(m.group(1)) / 100, float(m.group(2)) / 100
    m = re.search(prop + r":\s*center\s+([\d.]+)%", style or "")
    if m:
        return 0.5, float(m.group(1)) / 100
    return 0.5, 0.5


HERO_RX = re.compile(r"\.uc-hero \.uc-film\{[^}]*aspect-ratio:\s*(\d+)\s*/\s*(\d+)")
HERO_POS_RX = re.compile(r"\.uc-hero \.uc-film img\{[^}]*object-position:\s*([\d.]+)%\s+([\d.]+)%")


def hero_frame(body):
    """頁の style で冒頭の枠(.uc-hero .uc-film)の比を変えていればその比(PC・スマホ同じ)。無ければ None
    (2026-10-15 ユーザー「なんでこれを勝手に変えたの? 前のがいい」= 環遊世界の冒頭は 4:5 の縦長の枠なのに 16:9 と決め打ちして縦長の写真を外した誤り)"""
    m = HERO_RX.search(body)
    if not m:
        return None, None
    a = int(m.group(1)) / int(m.group(2))
    mp = HERO_POS_RX.search(body)
    pos = (float(mp.group(1)) / 100, float(mp.group(2)) / 100) if mp else None
    return ("冒頭の写真(この頁の比)", a, a), pos


def in_hero(body, pos):
    """img の位置 pos が class に uc-hero を持つ section の中か"""
    i = body.rfind("<section", 0, pos)
    if i < 0:
        return False
    tag = body[i:body.find(">", i) + 1]
    return "uc-hero" in tag and body.find("</section>", i, pos) < 0


def scan(fix=False):
    bad, unknown, fixed = [], [], 0
    for page in PAGES:
        src = page.read_text(encoding="utf-8")
        body = re.sub(r"<!--[\s\S]*?-->", "", src)
        hero, hero_pos = hero_frame(body)
        edits = []
        # 1) 枠の中の <img>
        for m in re.finditer(r'<img\b[^>]*\ssrc="(\.\./)?(assets/[^"?]+\.(?:jpg|png))[^"]*"[^>]*>', body):
            tag = m.group(0); rel = m.group(2)
            back = body[max(0, m.start() - 500):m.start()]
            cls = re.findall(r'class="([^"]*)"', back)
            frame, hit = None, False
            for c in reversed(cls):   # いちばん近い枠(None の枠= 検査しない枠も「近い枠」として止める・2026-10-20 cg3 が b-mouth と誤判定された)
                for tok in c.split():
                    if tok in FRAMES:
                        frame, hit = FRAMES[tok], True; break
                if hit:
                    break
            if not frame:
                continue
            css_pos = None
            if hero and frame[0] == FRAMES["uc-film"][0] and in_hero(body, m.start()):
                frame, css_pos = hero, hero_pos   # この頁の冒頭の枠は比が違う
            img = ROOT / rel
            if not img.exists():
                continue
            size, faces = faces_of(img)
            if size is None:
                continue
            w, h = size
            # 縦横の不一致(2026-10-15 ユーザー「まだ変に切れているよ」): 縦長の写真を横長の枠に入れると、顔を入れても体やポーズが切れる。
            # 横長の枠(比 1.3 以上)には横長の写真(比 1.2 以上)だけ。縦長しか無ければ横で焼くか、枠を変える
            fa = [a for a in frame[1:] if a]
            if fa and max(fa) >= 1.3 and w / h < 1.2:
                bad.append(f"{page.relative_to(ROOT)}: {rel} ({frame[0]}・{w}x{h}) 縦長の写真を横長の枠に入れている= 横長の写真に替えるか横で焼く"); continue
            if not faces:
                unknown.append(f"{page.relative_to(ROOT)}: {rel} ({frame[0]}) 顔なし= 静物か検出不可"); continue
            st = STYLE_RX.search(tag); style = st.group(1) if st else ""
            px, py = parse_pos(style, "object-position")
            if css_pos and "object-position" not in style:
                px, py = css_pos   # 頁の style で決めた位置
            ok = all(fits(w, h, faces, a, px, py) for a in frame[1:] if a)
            if ok:
                continue
            pos = best_pos(w, h, faces, frame[1:])
            label = f"{page.relative_to(ROOT)}: {rel} ({frame[0]}・{w}x{h}) 顔が枠から出る"
            if pos is None:
                bad.append(label + "= どの位置でも入らない(写真を替える)"); continue
            if fix:
                newstyle = re.sub(r"object-position:[^;\"]*;?", "", style).strip().rstrip(";")
                newstyle = (newstyle + ";" if newstyle else "") + f"object-position:{pos[0]}% {pos[1]}%"
                newtag = STYLE_RX.sub(f'style="{newstyle}"', tag, 1) if st else tag[:-1].rstrip("/") + f' style="{newstyle}">'
                edits.append((tag, newtag)); fixed += 1
            else:
                bad.append(label + f" → object-position:{pos[0]}% {pos[1]}%")
        # 2) 背景の板(--bd)
        for m in re.finditer(r'style="([^"]*--bd:url\((\.\./)?(assets/[^)?]+)[^)]*\)[^"]*)"', body):
            style = m.group(1); rel = m.group(3); img = ROOT / rel
            if not img.exists():
                continue
            size, faces = faces_of(img)
            if size is None:
                continue
            w, h = size
            if w / h < 1.2:
                unknown.append(f"{page.relative_to(ROOT)}: 板 {rel} ({w}x{h}) 縦長の写真を板に敷いている(人が選んだ板は機械で外さない・表示だけ)"); continue
            if not faces:
                continue
            px, py = parse_pos(style, "--bd-pos")
            if all(fits(w, h, faces, a, px, py) for a in PLATE[1:] if a):
                continue
            pos = best_pos(w, h, faces, PLATE[1:])
            label = f"{page.relative_to(ROOT)}: 板 {rel} ({w}x{h}) 顔が枠から出る"
            if pos is None:
                bad.append(label + "= どの位置でも入らない(写真を替えるか、顔の無い板に)"); continue
            if fix:
                newstyle = re.sub(r"--bd-pos:[^;\"]*;?", "", style).rstrip(";") + f";--bd-pos:{pos[0]}% {pos[1]}%"
                edits.append((f'style="{style}"', f'style="{newstyle}"')); fixed += 1
            else:
                bad.append(label + f" → --bd-pos:{pos[0]}% {pos[1]}%")
        if fix and edits:
            for old, new in edits:
                src = src.replace(old, new, 1)
            page.write_text(src, encoding="utf-8")
    return bad, unknown, fixed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()
    if not YUNET.exists():
        sys.exit(f"[ERR] YuNet が無い: {YUNET}")
    bad, unknown, fixed = scan(fix=a.fix)
    if a.verbose:
        for u in unknown:
            print("  -", u)
    if a.fix:
        print(f"face_fit: {fixed} 件の位置を書き換え" + (f"・入らない {len(bad)} 件: " + " / ".join(bad) if bad else ""))
        sys.exit(1 if bad else 0)
    if bad:
        print("★ 写真の枠切れ(顔が枠の外):\n  " + "\n  ".join(bad)); sys.exit(1)
    print(f"face_fit: ok(顔のある写真はすべて枠に入っている・顔なし/未検出 {len(unknown)} 件)")


if __name__ == "__main__":
    main()
