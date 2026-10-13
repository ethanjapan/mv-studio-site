# MV Studio — 紹介サイト

声で相談してつくる、AI映像ディレクター「MV Studio」のプロモーションサイト。
夜のオーロラから夏のプールへと移ろう 3D スクロール。日本語／繁體中文（台灣）対応。

## 構成
- `index.html` — マークアップ
- `css/styles.css` — スタイル
- `js/main.js` — WebGL背景・スクロール演出・言語切替

## ローカルで見る
```
python3 -m http.server 8000
# http://localhost:8000
```

## 作品を足す(2026-10-14・水鏡で手順を固めた)
1. `data/works.json` の先頭に1件(id・yt・asset・v・title・sub「〜MV ・ 3分49秒」・zh)→ `node gen_works.mjs`(トップの Cover Flow と works.html と繁中の辞書)
2. 素材: `python3 tools/new_work_assets.py --src <題字・歌詞の焼き込みが無い 4K 本編> --slug <id> --abbr <3字> --hero <コマ> --og <コマ> --title-ja <題> --title-zh <題> --out <作業フォルダ> [--card <コマ>]`
   - ループは 96 コマ。中にカットの継ぎ目があれば止まる(ディゾルブは拾えないので mp4 を目で見る)
   - 本編が G: へ退避済みなら `~/mnt/win5090/archive/mac-offload/<退避名>/` から読む(戻さなくてよい)
3. `assets/` へ置く: `lk_loop_<id>.mp4` `lk_poster_<id>.jpg` `lk_ja_<abbr>.png` `lk_tw_<abbr>.png` `og_links.jpg`(と作っていれば `wk_<id>.*`)
4. `links.html`(made_linlin のリンク集・手書き): og:image の ?v / ヒーロー `a.film`(href・aria-label・poster・loop・`<b>題</b>`・縦題・`dur.<abbr>`)/
   最新作ボタン `cta-main`(href・`cta.latest`)/ 作品棚の先頭に `wcard`(`w.<id>.title` `w.<id>.desc`)/ `snum` の総数 / 辞書 `cta.latest` `dur.<abbr>` `w.<id>.*`
5. `index.html` の「完成作品の上映時間」(番組の尺も含む合計= works.json からは出せない)と `js/main.js` の訳「NNN分」、`main.js?v=` を上げる
6. `node gen_works.mjs` の ★ が出なくなったことを確かめる(links.html に最新作が無いと ★ で知らせる)→ プレビューで 日/繁/英 → commit・push

Created by [@made_linlin](https://www.instagram.com/made_linlin/)
