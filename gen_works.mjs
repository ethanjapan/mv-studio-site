// 作品と番組の生成器: data/works.json(正本)から
//   index.html の <!-- gen:works --> / <!-- gen:shows --> の中身(トップ= 最新だけ)
//   works.html の同じ印の中身(一覧= 全部)
//   js/works_i18n.js(作品・番組の日本語→繁中の辞書。main.js / uc_i18n.js が先に読む)
// を書く。使い方: node gen_works.mjs  (build.mjs も最初に呼ぶ)
// 2026-10-13: 作品が増えるたびにスマホのトップが伸びていた(作品集 4.8 画面・番組 3.8 画面)。トップは最新だけ・全部は一覧ページへ。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(fileURLToPath(import.meta.url))
const DATA = JSON.parse(readFileSync(join(ROOT, 'data/works.json'), 'utf8'))
const TOP_WORKS = Infinity   // トップは Cover Flow= 高さ一定なので全作品を載せる(2026-10-13 ユーザー「iPod touch の音楽を選ぶ時の感じ」)
const TOP_SHOWS = 3   // トップに出す番組の数

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

// 説明「〜MV ・ 4分09秒」の尺の前で折れると「4 / 分09秒」になる(一覧の 2 列で実測)。尺を nowrap で包む。訳は頭の部分だけ辞書に持つ(尺は共通)
function splitSub(sub) {
  const i = sub.lastIndexOf(' ・ ')
  return i < 0 ? [sub, ''] : [sub.slice(0, i), sub.slice(i + 3)]
}
function subHtml(sub) {
  const [head, tail] = splitSub(sub)
  return tail ? `${esc(head)} ・ <span class="nw">${esc(tail)}</span>` : esc(sub)
}
function workCard(w, { autoplay = false } = {}) {
  const video = `<video src="assets/${w.asset}.mp4?v=${w.v}" poster="assets/${w.asset}.jpg?v=${w.v}" muted loop playsinline preload="none"${autoplay ? ' autoplay' : ''}></video>`
  const cap = `<figcaption><strong>${esc(w.title)}</strong><span>${subHtml(w.sub)}</span></figcaption>`
  // YouTube に上げていない作品(暁の誓剣)はリンク無しの札(2026-10-13: JSON 化の時に取りこぼして消していた)
  if (!w.yt) return `        <figure class="workcard">
          ${video}
          ${cap}
        </figure>`
  return `        <a class="worklink" href="${esc(w.yt)}" target="_blank" rel="noopener noreferrer"><figure class="workcard">
          ${video}
          <span class="yt-badge">YouTube</span>
          ${cap}
        </figure></a>`
}

function showCard(s, { autoplay = false } = {}) {
  const zhHref = s.zh_yt ? ` data-zh-href="${esc(s.zh_yt)}"` : ''
  const zhSrc = s.zh_asset ? ` data-zh-src="assets/${s.zh_asset}.mp4?v=${s.zh_v}" data-zh-poster="assets/${s.zh_asset}.jpg?v=${s.zh_v}"` : ''
  const langs = s.langs.map(l => `              <a class="lang-pill" href="${esc(l.yt)}" target="_blank" rel="noopener noreferrer"><span class="lp-l">${esc(l.l)}</span><span class="lp-d">${esc(l.d)}</span></a>`).join('\n')
  return `        <figure class="showcard">
          <a class="show-thumb" href="${esc(s.yt)}"${zhHref} target="_blank" rel="noopener noreferrer"><video src="assets/${s.asset}.mp4?v=${s.v}" poster="assets/${s.asset}.jpg?v=${s.v}"${zhSrc} muted loop playsinline preload="none"${autoplay ? ' autoplay' : ''}></video><span class="yt-badge">YouTube</span></a>
          <figcaption>
            <span class="show-genre">${esc(s.genre)}</span>
            <strong>${esc(s.title)}</strong>
            <span class="show-desc">${esc(s.desc)}</span>
            <span class="show-langs">
${langs}
            </span>
          </figcaption>
        </figure>`
}

const nW = DATA.works.length, nS = DATA.shows.length
// 文言(日本語→繁中)。作品・番組の本文と、ここで作る見出し・導線
const L = {
  flow: ['作品', '作品'],
  prev: ['前の作品', '上一支作品'],
  next: ['次の作品', '下一支作品'],
  allWorks: [`すべての作品を見る（${nW}本）→`, `看全部作品（${nW} 支）→`],
  allShows: [`番組をすべて見る（${nS}回）→`, `看全部節目（${nS} 集）→`],
  pageTitle: ['作品一覧 — MV Studio', '全部作品 — MV Studio'],
  eyebrowW: [`WORKS — 作品（${nW}本）`, `WORKS — 作品（${nW} 支）`],
  eyebrowS: [`SHOWS — 裏番組（${nS}回）`, `SHOWS — 幕後節目（${nS} 集）`],
}

// ---- トップ(index.html)
// Cover Flow の 1 枚(2026-10-13 ユーザー「YouTube のサムネを表示、スライドしたら動画再生」)。
// 表紙= YouTube のサムネ(無ければ手元の静止画)。中央に来たら main.js が YouTube の埋め込み(ミュート・インライン・ループ)を差し込む。
// YouTube に上げていない作品(暁の誓剣)だけ手元のループ動画
function ytId(url) { const m = /youtu\.be\/([\w-]+)/.exec(url || ''); return m ? m[1] : '' }
function flowItem(w) {
  const id = ytId(w.yt)
  const tag = w.yt ? 'a' : 'div'
  const attrs = (w.yt ? ` href="${esc(w.yt)}" target="_blank" rel="noopener noreferrer" data-yt="${id}"` : '')
  const img = id
    ? `<img src="https://i.ytimg.com/vi/${id}/maxresdefault.jpg" onerror="this.onerror=null;this.src='assets/${w.asset}.jpg?v=${w.v}'" alt="" loading="lazy" decoding="async">`
    : `<img src="assets/${w.asset}.jpg?v=${w.v}" alt="" loading="lazy" decoding="async">`
  const video = id ? '' : `<video data-src="assets/${w.asset}.mp4?v=${w.v}" muted loop playsinline preload="none" aria-hidden="true"></video>`
  return `        <${tag} class="cf-item"${attrs}>
          <span class="cf-cover">${img}${video}${w.yt ? '<span class="yt-badge">YouTube</span>' : ''}</span>
          <span class="cf-cap"><strong>${esc(w.title)}</strong><span>${subHtml(w.sub)}</span></span>
        </${tag}>`
}
const topWorks = `
      <div class="cflow reveal d2" data-n="${DATA.works.length}">
        <div class="cf-track" tabindex="0" role="group" aria-roledescription="carousel" aria-label="${L.flow[0]}">
${DATA.works.slice(0, TOP_WORKS).map(flowItem).join('\n')}
        </div>
        <div class="cf-ctl"><button type="button" class="cf-prev" aria-label="${L.prev[0]}"></button><div class="cf-bar" aria-hidden="true"><i></i></div><button type="button" class="cf-next" aria-label="${L.next[0]}"></button></div>
      </div>
      <a class="ch-cta reveal d3" href="works.html">${L.allWorks[0]}</a>
`
const topShows = `
      <div class="shows reveal d2">
${DATA.shows.slice(0, TOP_SHOWS).map(s => showCard(s)).join('\n')}
      </div>
      <a class="ch-cta reveal d3" href="works.html#shows">${L.allShows[0]}</a>
`
// ---- 一覧(works.html)
const allWorks = `
      <div class="works all">
${DATA.works.map(w => workCard(w, { autoplay: true })).join('\n')}
      </div>
`
const allShows = `
      <div class="shows">
${DATA.shows.map(s => showCard(s, { autoplay: true })).join('\n')}
      </div>
`

function fill(file, name, body) {
  const p = join(ROOT, file)
  const src = readFileSync(p, 'utf8')
  const m = src.match(new RegExp(`<!-- gen:${name}:start[^>]*-->`)), b = `<!-- gen:${name}:end -->`
  const i = m ? m.index : -1, j = src.indexOf(b)
  if (i < 0 || j < 0 || j < i) throw new Error(`${file}: 印 gen:${name} が無い`)
  const out = src.slice(0, i + m[0].length) + body + '      ' + src.slice(j)
  if (out !== src) { writeFileSync(p, out); console.log(`${file}: gen:${name} を書き換え`) }
}
fill('index.html', 'works', topWorks)
fill('index.html', 'shows', topShows)
fill('works.html', 'works', allWorks)
fill('works.html', 'shows', allShows)

// 一覧ページの見出しの数
{
  const p = join(ROOT, 'works.html'), src = readFileSync(p, 'utf8')
  const out = src.replace(/WORKS — 作品（\d+本）/, L.eyebrowW[0]).replace(/SHOWS — 裏番組（\d+回）/, L.eyebrowS[0])
  if (out !== src) { writeFileSync(p, out); console.log('works.html: 見出しの数を更新') }
}
// 完成した作品の数(トップの数字)
{
  const p = join(ROOT, 'index.html'), src = readFileSync(p, 'utf8')
  const out = src.replace(/data-count="\d+"( data-noi18n>0<\/span><span class="st-cap">完成した作品)/, `data-count="${nW}"$1`)
  if (out !== src) { writeFileSync(p, out); console.log('index.html: 完成した作品の数を更新') }
}

// 辞書
const dict = {}
for (const [ja, zh] of Object.values(L)) dict[ja] = zh
for (const w of DATA.works) {
  if (w.zh?.title) dict[w.title] = w.zh.title
  if (w.zh?.sub) {
    const [hj, tj] = splitSub(w.sub), [hz, tz] = splitSub(w.zh.sub)
    if (tj && tj === tz) dict[hj + ' ・'] = hz + ' ・'   // 文字ノードは「頭 ・ 」で終わる(trim されるので末尾の空白は無し)
    else dict[w.sub] = w.zh.sub
  }
}
// 一覧ページ(works.html)の固定文(見出し・リード文・注記)は main.js の辞書から写す(トップと同じ訳にする)
{
  const mainJs = readFileSync(join(ROOT, 'js/main.js'), 'utf8')
  // 形: const M=Object.assign({},{ ...辞書... },window.MV_WORKS_I18N||{});  (生成物が辞書に勝つ)
  const head = 'const M=Object.assign({},{'
  const s0 = mainJs.indexOf(head, mainJs.indexOf('(function i18n(){'))
  const s1 = mainJs.indexOf('\n  },window.MV_WORKS_I18N||{});', s0)
  if (s0 < 0 || s1 < 0) throw new Error('js/main.js の辞書 M が見つからない(形が変わった)')
  const M = (0, eval)('(' + mainJs.slice(s0 + head.length - 1, s1).trim() + '})')
  const page = readFileSync(join(ROOT, 'works.html'), 'utf8').replace(/<!-- gen:[\s\S]*?<!-- gen:\w+:end -->/g, '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
  const texts = new Set([...page.matchAll(/>([^<>]+)</g)].map(m => m[1].trim()).filter(Boolean))
  let n = 0
  for (const t of texts) if (M[t] != null && dict[t] == null) { dict[t] = M[t]; n++ }
  const unknown = [...texts].filter(t => dict[t] == null && /[ぁ-んァ-ン]/.test(t))
  if (unknown.length) console.warn('works.html の訳が無い文(日本語のまま出る):', unknown.join(' / '))
  console.log(`works.html の固定文 ${n} 件を main.js の辞書から写した`)
}
for (const s of DATA.shows) { if (s.zh?.genre) dict[s.genre] = s.zh.genre; if (s.zh?.title) dict[s.title] = s.zh.title; if (s.zh?.desc) dict[s.desc] = s.zh.desc }
const missing = [...DATA.works.filter(w => !w.zh?.title || !w.zh?.sub).map(w => w.title), ...DATA.shows.filter(s => !s.zh?.title || !s.zh?.desc).map(s => s.title)]
if (missing.length) console.warn('繁中が無い(日本語のまま出る):', missing.join(' / '))
const js = `/* 生成物: node gen_works.mjs が data/works.json から書く(手で編集しない)。作品・番組の日本語→繁中。main.js / uc_i18n.js の辞書に合流する */\nwindow.MV_WORKS_I18N=${JSON.stringify(dict)};\n`
const jp = join(ROOT, 'js/works_i18n.js')
let old = ''; try { old = readFileSync(jp, 'utf8') } catch {}
if (old !== js) { writeFileSync(jp, js); console.log('js/works_i18n.js を書き換え') }
console.log(`作品 ${nW} 本(トップ Cover Flow ${Math.min(nW, TOP_WORKS)})・番組 ${nS} 回(トップ ${TOP_SHOWS})`)
