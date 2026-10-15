# -*- coding: utf-8 -*-
"""物と場所(人物なしの写真)の配信用の絵を作る(2026-10-15)。
data/stills.json の各行の src.png(焼いた原寸の PNG・リポジトリの外)から
  assets/uc/<id>-600.webp / <id>-1200.webp(cwebp・<picture> の srcset 用)
  assets/uc/<id>.jpg(無い時だけ・<img> の後退先。縦 600 幅 / 横 900 幅)
を書く。冪等= 既にあって src より新しければ飛ばす(--force で作り直す)。GPU は使わない。
使い方: python3 tools/still_assets.py [--only 753_01,753_02] [--force]
前提= cwebp(brew の webp)。無ければ止める。
"""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "stills.json"
OUT = ROOT / "assets" / "uc"
WEBP_W = (600, 1200)
JPG_W = {"P": 600, "L": 900}


def newer(dst: Path, src: Path) -> bool:
    return dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime and dst.stat().st_size > 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    cwebp = shutil.which("cwebp")
    if not cwebp:
        sys.exit("[ERR] cwebp が無い(brew install webp)")
    only = {x for x in a.only.split(",") if x}
    d = json.loads(DATA.read_text(encoding="utf-8"))
    made, skipped, missing = 0, 0, []
    for it in d["items"]:
        if only and it["id"] not in only:
            continue
        src = (ROOT / it["src"]["png"]).resolve()
        if not src.exists():
            missing.append(f"{it['id']}: {src}")
            continue
        for w in WEBP_W:
            dst = OUT / f"{it['id']}-{w}.webp"
            if not a.force and newer(dst, src):
                skipped += 1
                continue
            # -resize W 0= 幅だけ指定して縦は比率。-af= 自動フィルタ(写真向き)。-m 6= いちばん丁寧な探索(静止画の一括なので時間は気にしない)
            r = subprocess.run([cwebp, "-quiet", "-q", "82", "-m", "6", "-af", "-resize", str(w), "0", str(src), "-o", str(dst)],
                               capture_output=True, text=True)
            if r.returncode != 0:
                sys.exit(f"[ERR] cwebp {dst.name}: {(r.stderr or r.stdout)[-200:]}")
            made += 1
            print(f"[webp] {dst.name} {dst.stat().st_size // 1024}KB")
        jpg = OUT / f"{it['id']}.jpg"
        if a.force or not jpg.exists():
            im = Image.open(src).convert("RGB")
            tw = JPG_W[it["orient"]]
            im = im.resize((tw, round(im.height * tw / im.width)), Image.LANCZOS)
            im.save(jpg, quality=85, optimize=True, progressive=True)
            made += 1
            print(f"[jpg]  {jpg.name} {im.width}x{im.height} {jpg.stat().st_size // 1024}KB")
    print(f"作った {made} / 飛ばした {skipped}" + (f" / 原寸が無い {len(missing)}: " + " ; ".join(missing) if missing else ""))
    if missing:
        sys.exit(1)


if __name__ == "__main__":
    main()
