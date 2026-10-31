# -*- coding: utf-8 -*-
"""JPEG / PNG のままの <img> に WebP の srcset を足す(2026-10-31・ユーザー「サイトは少し重いので最適化もしてね。演出をそのまま」)

なぜ: 写真 542 枚(44MB)が JPEG のまま配られていて、スマホにも PC と同じ大きさの絵が届いていた。
      同じ大きさの WebP にするだけで 38% 減(20 枚の試算)、スマホには 600 幅を選ばせるとさらに減る。
やり方: HTML の入れ子は変えない(<picture> で包むと `figure > img` などの CSS が外れる)。
      <img src="x.jpg"> に srcset="x.w600.webp 600w, x.w1200.webp 1200w"(名前は .wNNN= 既存の -600 とは別物) と sizes を足すだけ。
      srcset を読めない古いブラウザは今までどおり src の JPEG を使う。
sizes: 写真ごとに画面での実際の幅を測った data/img_sizes.json(402 幅と 1440 幅)から
      "(max-width:900px) <スマホの幅>vw, <PC の幅>vw" を作る。測り直し= scratchpad の measure_imgs.mjs 型(README「写真の srcset」)
対象外: <picture> の中・すでに srcset がある img・自動の区画(<!-- gen:… -->)の中・幅 120px 未満の小さな絵(印など)
使い方: python3 tools/img_srcset.py [--dry]   (cwebp が要る・冪等= 作った WebP は飛ばし、srcset のある img は触らない)
"""
import argparse
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PAGES = ["index.html", "works.html", "strengths.html", "studio.html", "engineering.html", "usecases/index.html",
         "usecases/bridal.html", "usecases/bridal_album.html", "usecases/portrait.html", "usecases/world.html",
         "usecases/kaisetsu.html", "usecases/shichigosan.html", "usecases/still.html", "usecases/daily.html"]
TARGETS = (600, 1200)
MIN_CSS = 120
IMG_RE = re.compile(r'<img\b[^>]*>')
SRC_RE = re.compile(r'\ssrc="((?:\.\./)?)(assets/[^"?]+\.(?:jpg|jpeg|png))(\?v=[^"]*)?"', re.I)


def variants(asset: str, dry: bool):
    """x.jpg → [(published path without prefix, width)]。既にあれば作らない"""
    src = ROOT / asset
    W = Image.open(src).width
    stem = asset.rsplit(".", 1)[0]
    out = []
    for t in TARGETS:
        if t == 1200 and W < 900:
            continue                       # 900 未満の元から 1200 は作らない(拡大になる)
        w = min(t, W)
        dst = ROOT / f"{stem}.w{t}.webp"   # 別名にする: 既存の X-600.webp は別の切り抜き(753_08 等で比が違う)
        if not dst.exists() and not dry:
            r = subprocess.run(["cwebp", "-quiet", "-q", "82", "-m", "6", "-af", "-resize", str(w), "0", str(src), "-o", str(dst)],
                               capture_output=True, text=True)
            if r.returncode != 0:
                sys.exit(f"[ERR] cwebp {dst.name}: {(r.stderr or r.stdout)[-200:]}")
        if dst.exists() or dry:
            ww = Image.open(dst).width if dst.exists() else w
            out.append((f"{stem}.w{t}.webp", ww))
    return out


def gen_ranges(s):
    return [(m.start(), s.find("-->", s.find(f"gen:{m.group(1)}:end", m.end())) + 3)
            for m in re.finditer(r"<!-- gen:([a-z0-9]+):start", s)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    if not shutil.which("cwebp"):
        sys.exit("[ERR] cwebp が無い(brew install webp)")
    sizes = json.loads((ROOT / "data/img_sizes.json").read_text(encoding="utf-8"))
    made_tags = 0
    for page in PAGES:
        p = ROOT / page
        s = p.read_text(encoding="utf-8")
        skip = gen_ranges(s)
        out, last, n = [], 0, 0
        for m in IMG_RE.finditer(s):
            tag = m.group(0)
            if "srcset=" in tag or any(a0 <= m.start() < b0 for a0, b0 in skip):
                continue
            if s.rfind("<picture", 0, m.start()) > s.rfind("</picture>", 0, m.start()):
                continue
            sm = SRC_RE.search(tag)
            if not sm:
                continue
            prefix, asset, v = sm.group(1), sm.group(2), sm.group(3) or ""
            if not (ROOT / asset).exists():
                continue
            sz = sizes.get(asset)
            if not sz or max(sz["m"], sz["d"]) < MIN_CSS:
                continue
            vs = variants(asset, a.dry)
            if not vs:
                continue
            mv = min(100, math.ceil(sz["m"] / 402 * 100)) if sz["m"] else 100
            dv = min(100, math.ceil(sz["d"] / 1440 * 100)) if sz["d"] else 100
            srcset = ", ".join(f"{prefix}{path}{v} {w}w" for path, w in vs)
            add = f' srcset="{srcset}" sizes="(max-width:900px) {mv}vw, {dv}vw"'
            new = tag[:sm.end()] + add + tag[sm.end():]
            out.append(s[last:m.start()]); out.append(new); last = m.end(); n += 1
        if n:
            out.append(s[last:])
            if not a.dry:
                p.write_text("".join(out), encoding="utf-8")
            print(f"{page}: srcset を足した img {n}")
            made_tags += n
    print(f"合計 {made_tags} 枚" + ("(--dry= 書いていない)" if a.dry else ""))


if __name__ == "__main__":
    main()
