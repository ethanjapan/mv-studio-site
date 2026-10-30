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

## 物と場所(人物なしの写真)を足す(2026-10-15)
1. 焼いた原寸の PNG(`_site_bg/<テーマ>_<日付>/`)から採用する 1 枚を決める(候補は 4 案・あなたが選ぶ)
2. `data/stills.json` の items に 1 行(id / shelf / orient P|L / ja / zh / v / status live / src= 台本・場面・seed・job / shelf_key= APP の棚の鍵)
3. `python3 tools/still_assets.py` → `assets/uc/<id>-600.webp` `<id>-1200.webp`(と無ければ `<id>.jpg`)
4. `node gen_shelves.mjs`(build でも走る)→ `usecases/still.html` の棚と `js/stills_i18n.js`。絵や題が欠けていれば止まる
5. APP の棚(photo-browser)側は mvdirector の `scripts/add_st_*_styles.py`(様式の行)と `gravure_variety_lab/site_still_base/`(見本)で同じ鍵を持つ

## 毎朝の作例の頁(usecases/daily.html・2026-10-31)
- 10 月の投稿= `data/portrait_ig.json` の `posts`(組・新しい順・date / ja / zh / en / reel)と `items`(`src.ig_post` で組に属する)。1 組足す= posts に 1 行 + items に写真の行(ig_post を揃える)+ `python3 tools/still_assets.py --data data/portrait_ig.json` → `node gen_daily.mjs`(build も呼ぶ)。帯の先頭の縦のリールは `assets/uc/reel_<reel>.mp4`(IG の noBGM 版を 720x1280・無音・crf24・faststart)+ 先頭コマの `.jpg`
- 撮影会の頁(portrait.html)の LATEST は同じ JSON から「新しい順の 9 枚 + 全部へのリンク」だけ(gen_shelves.mjs の pig の latest)。全部はこの頁
- 11 月の予告= `data/daily.json` の items(組の表紙 1 枚ずつ・`src.reel_date` / `photo_date`)。公開が済んだ組は portrait_ig.json の posts/items へ移し、daily.json から消す(予告の格子には M1031 のように posts 側の表紙が先頭に入る)
- 頁の固定の文の繁中と英語は `data/daily.json` の `strings`(gen_daily.mjs が js/daily_i18n.js に書き、uc_i18n.js の辞書に合流する)。`<title>` だけは uc_i18n.js の M と data/i18n_en/00_titles.tsv
- ★build の検査(lint 9)は gen_daily より先に走るので、文を足したら `node gen_daily.mjs` を先に回してから `npm run build`

## 英語(2026-10-15)
- 言語は 日本語 / 繁中 / EN の 3 つ。繁中は `js/main.js` と `js/uc_i18n.js` の辞書 M(日本語の文→繁中)、英語は `data/i18n_en/*.tsv`(日本語の文 <TAB> 英語 [<TAB> main|uc])が正本で、`node gen_i18n.mjs`(build が呼ぶ)が `js/en_main.js` / `js/en_uc.js` を書く。繁中の辞書に鍵があって英語が無いとビルドが止まる
- 同じ日本語が頁で意味が違う時(「衣装」= Outfit / garments)は 3 列目で main か uc に限定する。頁の `<title>` のように繁中の辞書に無い鍵も、3 列目を付ければ入る
- 見出しは要素で分かれている(「話すだけで、」+「MVができる。」)。英語は断片をつなげて読んで文になるように書く。英字の断片の境目の空白と、残った「。」「、」は切替の時に機械で直す
- 作品・番組の英語は `data/works.json` の `en`、物と場所は `data/stills.json` の `en` / `sub_en`(生成器が `*_I18N_EN` に書く)

## 撮影会ポートレートの「毎朝の作例」を足す(2026-10-23)
- 正本= `data/portrait_ig.json`(IG @ethan_ai_photo に選んだ写真。`src.png` は gravure_variety_lab の原寸)。1 枚足す= 1 行 + `python3 tools/still_assets.py --data data/portrait_ig.json` → `node gen_shelves.mjs`(build も呼ぶ)
- 載せるのは肌の正本(PNG の文に「real person photographed on location」があり「tiny moles」が無い)だけ。満たさない行は `status: candidate`
- 縦のリール= `assets/uc/reel_<名>.mp4`(IG の noBGM 版を 720x1280・無音・crf24・faststart)+ 先頭コマの `.jpg`。枠は `usecases/portrait.html` の `.uc-reel-row` に手で 1 行
- 棚のお気に入りから選んだ新作(2026-10-24)= `data/portrait_fav.json`(撮影会 03・SET pfav)/ `data/bridal_fav.json`(ブライダル 03・bfav)/ `data/world_fav.json`(世界 03・wfav)。足し方は上と同じ(still_assets.py --data → gen_shelves.mjs)。1 様式 1 枚・肌の正本だけ・各棚 9 枚目までに横長を入れない(段に穴が空く)。頁の「ここに並ぶのは N」の数も合わせる
