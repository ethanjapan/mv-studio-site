// 言語別の頁(2026-10-20 ユーザー「繁中・英語の頁を検索に載せる」「sitemap・canonical・構造化データ」)
// 日本語の頁はそのまま(URL も変えない)。同じ HTML を /zh/<頁> と /en/<頁> に書き出し、頁の言語で開く。
//   - 本文の訳は今までどおり main.js / uc_i18n.js の setLang が辞書で行う(window.__mvForceLang で頁の言語に固定)。Google は JavaScript を実行して索引に載せる
//   - <title>・説明文・OG は HTML の段階で訳しておく(題= 辞書、説明= data/seo_meta.json)
//   - 全言語の頁に canonical(自分)と hreflang(ja / zh-Hant / en / x-default= ja)・構造化データ(JSON-LD)を足す
//   - 相対パス(assets/ css/ js/)は 1 段深くなるので ../ を足す。頁どうしのリンク(.html・./・../)はそのまま= 言語の中で行き来する
// build.mjs が呼ぶ(dist にだけ書く= ソースの頁は増やさない)。sitemap.xml も書く。
// ★robots.txt は書かない: GitHub Pages のプロジェクトサイトは /mv-studio-site/ の下なので、置いても検索エンジンは読まない(robots.txt はホストの直下だけ有効)。sitemap は Search Console から送る
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const META = JSON.parse(readFileSync(join(ROOT, 'data/seo_meta.json'), 'utf8'))
export const SITE = META.site
export const PAGES = Object.keys(META.pages)
export const LANGS = ['zh', 'en']
const HREFLANG = { ja: 'ja', zh: 'zh-Hant', en: 'en' }
const HTML_LANG = { ja: 'ja', zh: 'zh-Hant-TW', en: 'en' }
const OG_LOCALE = { ja: 'ja_JP', zh: 'zh_TW', en: 'en_US' }

function dictZh(file) {   // gen_i18n.mjs と同じ取り出し方
  const src = readFileSync(join(ROOT, file), 'utf8')
  const head = 'const M=Object.assign({},{'
  const s0 = src.indexOf(head), s1 = src.indexOf('\n  },window.MV_WORKS_I18N', s0)
  if (s0 < 0 || s1 < 0) throw new Error(`${file} の辞書 M が見つからない(形が変わった)`)
  return (0, eval)('(' + src.slice(s0 + head.length - 1, s1).trim() + '})')
}
function dictEn(file) {
  const src = readFileSync(join(ROOT, file), 'utf8')
  return (0, eval)('(' + src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1) + ')')
}
let D = null
function dicts() {
  if (!D) D = { main: { zh: dictZh('js/main.js'), en: dictEn('js/en_main.js') }, uc: { zh: dictZh('js/uc_i18n.js'), en: dictEn('js/en_uc.js') } }
  return D
}

// 頁の URL(index は / で終える)
export function urlOf(rel, lang) {
  const r = rel.replace(/(^|\/)index\.html$/, '$1')
  return SITE + (lang === 'ja' ? '' : lang + '/') + r
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function jsonLd(rel, lang) {
  const m = META.pages[rel], nm = (r) => META.pages[r].name[lang]
  let data
  if (rel === 'index.html') {
    data = [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: 'MV Studio', url: urlOf(rel, lang), inLanguage: HTML_LANG[lang] },
      { '@context': 'https://schema.org', '@type': 'Organization', name: 'MV STUDIO', url: SITE, logo: SITE + 'assets/apple-touch-icon.png',
        sameAs: ['https://www.youtube.com/@mvstudio_by_linlin', 'https://www.instagram.com/made_linlin/'] },
    ]
  } else {
    const items = [{ name: nm('index.html'), item: urlOf('index.html', lang) }]
    if (rel.startsWith('usecases/') && rel !== 'usecases/index.html') items.push({ name: nm('usecases/index.html'), item: urlOf('usecases/index.html', lang) })
    if (rel === 'usecases/bridal_album.html') items.push({ name: nm('usecases/bridal.html'), item: urlOf('usecases/bridal.html', lang) })
    items.push({ name: m.name[lang], item: urlOf(rel, lang) })
    data = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((x, i) => ({ '@type': 'ListItem', position: i + 1, ...x })) }
  }
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
}

function headLinks(rel, lang) {
  const alt = ['ja', ...LANGS].map(l => `<link rel="alternate" hreflang="${HREFLANG[l]}" href="${urlOf(rel, l)}">`).join('\n')
  return `<link rel="canonical" href="${urlOf(rel, lang)}">\n${alt}\n<link rel="alternate" hreflang="x-default" href="${urlOf(rel, 'ja')}">\n${jsonLd(rel, lang)}\n<meta property="og:locale" content="${OG_LOCALE[lang]}">`
}

function setMeta(html, attr, key, value) {   // <meta name|property="key" content="..."> を書き換え(無ければ足さない)
  const re = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`)
  return re.test(html) ? html.replace(re, `$1${esc(value)}$2`) : html
}

// 相対の素材のパスに ../ を足す(頁のリンクと絶対 URL・#・mailto は触らない)
function isPage(v) { const p = v.split(/[?#]/)[0]; return p === '' || p === '.' || p === '..' || /\/$/.test(p) || /\.html$/.test(p) }
function isAbs(v) { return /^(https?:|\/\/|#|mailto:|tel:|data:|javascript:|\/)/i.test(v) }
function fix(v) { return (isAbs(v) || isPage(v)) ? v : '../' + v }
function rewritePaths(html) {
  html = html.replace(/(\s(?:src|href|poster|data-src|data-zh-src|data-zh-poster|data-zh-img|data-zh-fb|data-zh-vsrc)=")([^"]*)"/g, (_, a, v) => `${a}${fix(v)}"`)
  html = html.replace(/(\ssrcset=")([^"]*)"/g, (_, a, v) => a + v.split(',').map(s => { const t = s.trim(); const [u, ...r] = t.split(/\s+/); return [fix(u), ...r].join(' ') }).join(', ') + '"')
  html = html.replace(/(this\.src=')([^']*)'/g, (_, a, v) => `${a}${fix(v)}'`)   // onerror の後退先
  // 頁の <style> の中の url( も文書から解決される(アルバムの麻布・紙の地)。カスタムプロパティ(--x:url)は使う側の CSS から解決されるので触らない
  html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, (block) => block.replace(/(--[a-z0-9-]+\s*:\s*)?url\((['"]?)([^)'"]+)\2\)/gi, (m, cp, q, v) => cp ? m : `url(${q}${fix(v)}${q})`))
  html = html.replace(/(\sstyle="[^"]*?)(url\()([^)"']+)(\))/g, (m, a, u, v, z) => a.trimEnd().endsWith('--bd:') ? m : `${a}${u}${fix(v)}${z}`)   // 文書から見た url( だけ(--bd は CSS 側で解決されるので触らない)
  return html
}

// lang= 'ja' は日本語の頁に canonical / hreflang / 構造化データを足すだけ
export function localize(raw, rel, lang) {
  const m = META.pages[rel]
  if (!m) return raw
  let html = raw
  const scope = /js\/main\.js/.test(raw) ? 'main' : 'uc'
  const jaTitle = (raw.match(/<title>([^<]*)<\/title>/) || [])[1] || ''
  if (lang === 'ja') {
    if (m.ja_description) html = setMeta(html, 'name', 'description', m.ja_description)
    if (m.ja_og) html = setMeta(html, 'property', 'og:description', m.ja_og)
    return html.replace('</head>', headLinks(rel, 'ja') + '\n</head>')
  }
  const d = dicts()[scope][lang]
  const title = d[jaTitle]
  if (!title) throw new Error(`${rel}: 題「${jaTitle}」の${lang === 'zh' ? '繁中' : '英語'}が辞書に無い`)
  const t = m[lang]
  if (!t || !t.description || !t.og) throw new Error(`${rel}: data/seo_meta.json に ${lang} の description / og が無い`)
  const depth = rel.split('/').length   // 頁が置かれる深さ(言語のフォルダの分 + 元の深さ)
  html = rewritePaths(html)
  html = html.replace('<html lang="ja">', `<html lang="${HTML_LANG[lang]}">`)
  html = html.replace(/(<meta charset="[^"]*"\s*\/?>)/, `$1\n<script>window.__mvForceLang='${lang}';window.__mvRoot='${'../'.repeat(depth)}';</script>`)   // 文字コードの宣言の直後(先頭 1024 バイトの内に置く)
  html = html.replace('lang=localStorage.getItem("mvlang")||"ja"', 'lang=window.__mvForceLang||localStorage.getItem("mvlang")||"ja"')   // 頭の書体の読み分け
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
  html = setMeta(html, 'name', 'description', t.description)
  html = setMeta(html, 'property', 'og:title', title)
  html = setMeta(html, 'property', 'og:description', t.og)
  html = setMeta(html, 'property', 'og:url', urlOf(rel, lang))
  return html.replace('</head>', headLinks(rel, lang) + '\n</head>')
}

export function sitemap() {
  const urls = PAGES.flatMap(rel => ['ja', ...LANGS].map(lang => {
    const alts = ['ja', ...LANGS].map(l => `    <xhtml:link rel="alternate" hreflang="${HREFLANG[l]}" href="${urlOf(rel, l)}"/>`).join('\n')
    return `  <url>\n    <loc>${urlOf(rel, lang)}</loc>\n${alts}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${urlOf(rel, 'ja')}"/>\n  </url>`
  }))
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`
}
