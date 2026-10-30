// 毎朝の作例の頁(usecases/daily.html)の生成器(2026-10-31)
//   10 月の投稿= data/portrait_ig.json の posts(組・新しい順)と items(src.ig_post で組に属する)→ 組ごとの 1 行(帯)。縦のリールがある組は帯の先頭に
//   11 月の予告= data/daily.json の items(組の表紙 1 枚ずつ)→ 日付つきの格子
//   辞書= js/daily_i18n.js(日本語→繁中 _I18N と英語 _I18N_EN。uc_i18n.js の辞書に合流する)
// 使い方: node gen_daily.mjs  (build.mjs が gen_shelves の後に呼ぶ)。絵は tools/still_assets.py --data data/portrait_ig.json / data/daily.json
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(fileURLToPath(import.meta.url))
const PAGE = 'usecases/daily.html'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const md = (d) => d.slice(5).replace('-', '.')
const wd = (d) => WD[new Date(d + 'T00:00:00+09:00').getDay()]

function fill(file, name, body) {
  const p = join(ROOT, file)
  const src = readFileSync(p, 'utf8')
  const m = src.match(new RegExp(`<!-- gen:${name}:start[^>]*-->`)), b = `<!-- gen:${name}:end -->`
  const i = m ? m.index : -1, j = src.indexOf(b)
  if (i < 0 || j < 0 || j < i) throw new Error(`${file}: 印 gen:${name} が無い`)
  const o = src.slice(0, i + m[0].length) + body + '      ' + src.slice(j)
  if (o !== src) { writeFileSync(p, o); console.log(`${file}: gen:${name} を書き換え`) }
}

if (!existsSync(join(ROOT, PAGE))) { console.log(`毎朝の作例: ${PAGE} がまだ無いので飛ばす`); process.exit(0) }
const IG = JSON.parse(readFileSync(join(ROOT, 'data/portrait_ig.json'), 'utf8'))
const NV = JSON.parse(readFileSync(join(ROOT, 'data/daily.json'), 'utf8'))
const live = IG.items.filter(it => it.status === 'live')
const bad = []
const pic = (it, sizes) => {
  const v = it.v ? `?v=${it.v}` : '', s = `../assets/uc/${it.id}`
  for (const f of [`assets/uc/${it.id}.jpg`, `assets/uc/${it.id}-600.webp`, `assets/uc/${it.id}-1200.webp`]) if (!existsSync(join(ROOT, f))) bad.push(`${it.id}: ${f} が無い(python3 tools/still_assets.py --data …)`)
  return `<picture><source type="image/webp" srcset="${s}-600.webp${v} 600w, ${s}-1200.webp${v} 1200w" sizes="${sizes}"><img src="${s}.jpg${v}" alt="" loading="lazy" decoding="async"></picture>`
}

// ---- 10 月の投稿(組ごとの帯)
let out = '\n', nPost = 0, nPic = 0
for (const p of IG.posts) {
  const items = live.filter(it => it.src?.ig_post === p.key)
  if (!items.length) continue
  nPost++; nPic += items.length
  const reel = p.reel ? `            <figure class="dp-reel"><video src="../assets/uc/reel_${p.reel}.mp4?v=1031a" poster="../assets/uc/reel_${p.reel}.jpg?v=1031a" muted loop playsinline autoplay preload="metadata"></video><figcaption data-noi18n>REEL</figcaption></figure>\n` : ''
  if (p.reel) for (const f of [`assets/uc/reel_${p.reel}.mp4`, `assets/uc/reel_${p.reel}.jpg`]) if (!existsSync(join(ROOT, f))) bad.push(`${p.key}: ${f} が無い`)
  const figs = items.map(it => `            <figure>${pic(it, '(max-width:900px) 42vw, 15vw')}<figcaption>${esc(it.ja)}</figcaption></figure>`).join('\n')
  out += `        <article class="dp reveal" id="p-${p.key}">
          <div class="dp-h">
            <span class="dp-d" data-noi18n>${md(p.date)}<i>${wd(p.date)}</i></span>
            <h3 class="dp-t">${esc(p.ja)}</h3>
            <span class="dp-n" data-noi18n>${items.length} FRAMES${p.reel ? '<em>REEL</em>' : ''}</span>
          </div>
          <div class="dp-strip">
${reel}${figs}
          </div>
        </article>
`
}
fill(PAGE, 'daily', out)

// ---- 11 月の予告(表紙の格子・公開日の順)。M1031(10/31・もう出た回)は portrait_ig の方に写真があるので、その表紙(high)を先頭に足す
const m1031 = live.find(it => it.src?.ig_post === 'M1031' && /_high$/.test(it.id))
const nov = [...NV.items.filter(it => it.status === 'live')]
if (m1031) nov.unshift(Object.assign({}, m1031, { date: '2026-10-31', src: Object.assign({}, m1031.src, { reel_date: '2026-10-31', photo_date: '2026-10-31' }) }), )
nov.sort((a, b) => a.date.localeCompare(b.date))
const title1031 = IG.posts.find(p => p.key === 'M1031')
let nv = '\n'
for (const it of nov) {
  const ja = it.src?.ig_post === 'M1031' ? title1031.ja : it.ja
  const dates = `REEL ${md(it.src.reel_date)}${it.src.photo_date && it.src.photo_date !== it.src.reel_date ? `<i>PHOTOS ${md(it.src.photo_date)}</i>` : ''}`
  nv += `          <a class="nv reveal" href="https://www.instagram.com/ethan_ai_photo/" target="_blank" rel="noopener noreferrer"><figure>${pic(it, '(max-width:900px) 50vw, 25vw')}</figure><span class="nv-d" data-noi18n>${dates}</span><span class="nv-t">${esc(ja)}</span></a>\n`
}
fill(PAGE, 'dailynov', nv)
if (bad.length) throw new Error('毎朝の作例: ' + bad.join(' / '))

// ---- 辞書(日本語→繁中・英語): 組の題・写真の題・予告の題・頁の固定の文(data/daily.json の strings)
const dict = {}, dictEn = {}
for (const p of IG.posts) { dict[p.ja] = p.zh; dictEn[p.ja] = p.en }
for (const it of [...live, ...NV.items]) { dict[it.ja] = it.zh; if (it.en) dictEn[it.ja] = it.en }
for (const [ja, [zh, en]] of Object.entries(NV.strings || {})) { dict[ja] = zh; dictEn[ja] = en }
const js = `/* 生成物: node gen_daily.mjs が data/portrait_ig.json と data/daily.json から書く(手で編集しない)。毎朝の作例の頁の組の題・写真の題・固定の文の 日本語→繁中(_I18N)と英語(_I18N_EN)。uc_i18n.js の辞書に合流する */\nwindow.MV_DAILY_I18N=${JSON.stringify(dict)};\nwindow.MV_DAILY_I18N_EN=${JSON.stringify(dictEn)};\n`
const jp = join(ROOT, 'js/daily_i18n.js')
let old = ''; try { old = readFileSync(jp, 'utf8') } catch {}
if (old !== js) { writeFileSync(jp, js); console.log('js/daily_i18n.js を書き換え') }
console.log(`毎朝の作例: ${nPost} 組 ${nPic} 枚・予告 ${nov.length} 組`)
