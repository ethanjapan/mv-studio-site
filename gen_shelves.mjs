// 棚の頁の生成器(2026-10-15): データ 1 つ → 頁の棚 + 繁中の辞書。「物と場所」(data/stills.json)と「美容」(data/beauty.json)が同じ仕組みで動く。
//   <頁> の <!-- gen:<name>:shelves --> の中身(棚= テーマごとに h3 + 写真の格子。各棚は最初の show_first 枚だけ見せ、残りは畳む)
//   js/<name>_i18n.js(棚の見出し・説明・写真の題の 日本語→繁中。uc_i18n.js が先に読む)
// 使い方: node gen_shelves.mjs  (build.mjs も最初に呼ぶ)。1 枚足す= JSON に 1 行 + tools/still_assets.py --data <json>。
// 配信は <picture>: WebP(600/1200 幅・cwebp)を srcset で出し、<img> は従来の JPEG(後退先)。AVIF はこの Mac に符号器が無いので今は作らない。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(fileURLToPath(import.meta.url))
// 棚の頁の一覧。name= 印 gen:<name>:shelves と js/<name>_i18n.js の名前
const SETS = [
  { name: 'still', data: 'data/stills.json', page: 'usecases/still.html', jp: '物と場所' },
  { name: 'beauty', data: 'data/beauty.json', page: 'usecases/beauty.html', jp: '美容' },
]
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

function fill(file, name, body) {
  const p = join(ROOT, file)
  const src = readFileSync(p, 'utf8')
  const m = src.match(new RegExp(`<!-- gen:${name}:start[^>]*-->`)), b = `<!-- gen:${name}:end -->`
  const i = m ? m.index : -1, j = src.indexOf(b)
  if (i < 0 || j < 0 || j < i) throw new Error(`${file}: 印 gen:${name} が無い`)
  const o = src.slice(0, i + m[0].length) + body + '      ' + src.slice(j)
  if (o !== src) { writeFileSync(p, o); console.log(`${file}: gen:${name} を書き換え`) }
}

for (const SET of SETS) {
  if (!existsSync(join(ROOT, SET.data)) || !existsSync(join(ROOT, SET.page))) { console.log(`${SET.jp}: ${SET.page} がまだ無いので飛ばす`); continue }
  const DATA = JSON.parse(readFileSync(join(ROOT, SET.data), 'utf8'))
  const PAGE = SET.page
  const SHOW = DATA.show_first || 6
  // ---- 検査(ビルドを止める): 棚の鍵・題・絵の実在
  const bad = []
  const shelfKeys = new Set(DATA.shelves.map(s => s.key))
  const live = DATA.items.filter(it => it.status === 'live')
  for (const it of live) {
    if (!shelfKeys.has(it.shelf)) bad.push(`${it.id}: 棚 '${it.shelf}' が shelves に無い`)
    if (!it.ja || !it.zh) bad.push(`${it.id}: 題(ja/zh)が欠けている`)
    if (!['P', 'L'].includes(it.orient)) bad.push(`${it.id}: orient は P か L`)
    for (const f of [`assets/uc/${it.id}.jpg`, `assets/uc/${it.id}-600.webp`, `assets/uc/${it.id}-1200.webp`])
      if (!existsSync(join(ROOT, f))) bad.push(`${it.id}: ${f} が無い(python3 tools/still_assets.py)`)
  }
  const ids = live.map(it => it.id)
  if (new Set(ids).size !== ids.length) bad.push('id が重複している')
  if (bad.length) throw new Error(`${SET.data}: ` + bad.join(' / '))

  // ---- 1 枚の札。<picture>= WebP を幅 2 つ・<img> は JPEG。sizes は格子の列数(PC 6 列 / スマホ 3 列・横は 3 升・大は 2x2)から
  const SIZES = { P: '(max-width:900px) 33vw, 17vw', big: '(max-width:900px) 66vw, 34vw', L: '(max-width:900px) 100vw, 50vw' }
  function fig(it, { big = false } = {}) {
    const cls = ['reveal', it.orient === 'L' ? 'wide' : '', big ? 'big' : ''].filter(Boolean).join(' ')
    const v = it.v ? `?v=${it.v}` : ''
    const src = `../assets/uc/${it.id}`
    return `          <figure class="${cls}"><picture><source type="image/webp" srcset="${src}-600.webp${v} 600w, ${src}-1200.webp${v} 1200w" sizes="${SIZES[big ? 'big' : it.orient]}"><img src="${src}.jpg${v}" alt="" loading="lazy" decoding="async"></picture><figcaption>${esc(it.ja)}</figcaption></figure>`
  }
  const FOLD_BTN = `        <button type="button" class="ch-cta fold-btn" aria-expanded="false"><span class="fold-l"><span class="ja">続きを見る</span><span class="zh">看更多</span></span><span class="fold-ic-w" aria-hidden="true"><i class="fold-ring"></i><svg class="fold-ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5"/><path d="M8 10.5l4 4 4-4"/></svg></span></button>`

  // ---- 棚
  let out = '\n', nShelf = 0
  for (const sh of DATA.shelves) {
    const items = live.filter(it => it.shelf === sh.key)
    if (!items.length) continue
    nShelf++
    const head = items.slice(0, SHOW), rest = items.slice(SHOW)
    // 棚の律動(撮影会の棚と同じ作法): 6 枚以上の棚は 1 枚目の縦を 2x2 の大きな札に
    const grid = (list, first) => list.map((it, i) => fig(it, { big: first && i === 0 && it.orient === 'P' && items.length >= SHOW })).join('\n')
    out += `        <h3><i></i>${esc(sh.en)} <span>${esc(sh.ja)}</span></h3>
          <div class="uc-grid">
  ${grid(head, true)}
          </div>
  `
    if (rest.length) {
      out += `        <div class="fold-body" hidden>
            <div class="uc-grid">
  ${grid(rest, false)}
            </div>
          </div>
  ${FOLD_BTN.replace('続きを見る', `続きを見る（${rest.length} 枚）`).replace('看更多', `看更多（${rest.length} 張）`)}
  `
    }
  }

  fill(PAGE, `${SET.name}:shelves`, out)

  // 頁の中の枚数(「いまは七五三の九枚から」のような文は書かず、数字だけ data-still-count で差し替える)
  {
    const p = join(ROOT, PAGE), src = readFileSync(p, 'utf8')
    const o = src.replace(/(<span data-still-count>)\d+(<\/span>)/g, `$1${live.length}$2`)
    if (o !== src) { writeFileSync(p, o); console.log(`${PAGE}: 枚数を ${live.length} に`) }
  }

  // ---- 辞書(日本語→繁中)。棚の見出し・説明・題。畳む札の文字は札の中に ja/zh を両方持つ
  const dict = {}
  for (const sh of DATA.shelves) { dict[sh.ja] = sh.zh; if (sh.sub_ja && sh.sub_zh) dict[sh.sub_ja] = sh.sub_zh }
  for (const it of live) dict[it.ja] = it.zh
  const js = `/* 生成物: node gen_shelves.mjs が ${SET.data} から書く(手で編集しない)。${SET.jp}の棚の見出しと題の 日本語→繁中。uc_i18n.js の辞書に合流する */\nwindow.MV_${SET.name.toUpperCase()}_I18N=${JSON.stringify(dict)};\n`
  const jp = join(ROOT, `js/${SET.name}_i18n.js`)
  let old = ''; try { old = readFileSync(jp, 'utf8') } catch {}
  if (old !== js) { writeFileSync(jp, js); console.log(`js/${SET.name}_i18n.js を書き換え`) }
  console.log(`${SET.jp}: ${live.length} 枚・${nShelf} 棚(候補 ${DATA.items.filter(it => it.status === 'candidate').length}・没 ${DATA.items.filter(it => it.status === 'rejected').length})`)
}
