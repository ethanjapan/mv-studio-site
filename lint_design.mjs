// デザインの決まり(DESIGN_RULES.md)の自動検査。npm run build が最初に呼ぶ。違反があれば終了コード 1 でビルドを止める
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = dirname(fileURLToPath(import.meta.url))
const pages = ['index.html', 'works.html', 'strengths.html', 'links.html', 'studio.html', 'engineering.html', ...readdirSync(join(ROOT, 'usecases')).filter(f => f.endsWith('.html')).map(f => 'usecases/' + f)]
  .filter(f => { try { return statSync(join(ROOT, f)).isFile() } catch { return false } })
const bad = []
// 1) 導線の文字の矢印(a / button / .ch-cta / .btn の中)。値の変化やキーの説明は許す
const ARROW_OK = [/F1\.4 → F8/, /← → キー/, /← → 鍵/, /TAP TO START」→/]
for (const f of pages) {
  const html = readFileSync(join(ROOT, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
  for (const m of html.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const text = m[2].replace(/<[^>]+>/g, '')
    if (/[→←↓↑]/.test(text) && !ARROW_OK.some(r => r.test(text))) bad.push(`${f}: 導線に文字の矢印: ${text.trim().slice(0, 40)}`)
  }
}
// 2) ピル型(角丸 100px/999px + 枠線 + 余白)の新しい規則。基底の古い規則は上書き層で線の形になるので許す(ALLOW)
const ALLOW = new Set(['.lang-switch', '.ls-btn', '.chip', '.chip em', '.btn', '.thought', '.prop-opt', '.st-chip', '.res-tier', '.show-genre', '.ch-cta', '.lang-pill',
  '.intro-btn', '.intro-tap', '.alb-chap button', '.lang button', '.film .dur', '.tag', '.cta', '.chips a', '.win .dur', '.pair-links a'])
function scanCss(name, css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim().split('\n').pop().trim(), d = m[2]
    if (sel.startsWith('@')) continue
    const r = /border-radius:\s*(100px|999px|9999px|100vmax)/.test(d), b = /(^|;)\s*border(-top|-bottom)?:\s*1px/.test(d), p = /padding/.test(d)
    if (r && b && p && !ALLOW.has(sel)) bad.push(`${name}: ピル型の新しい規則: ${sel}`)
  }
}
scanCss('css/theater.css', readFileSync(join(ROOT, 'css/theater.css'), 'utf8'))
for (const f of pages) for (const st of readFileSync(join(ROOT, f), 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) scanCss(f, st[1])

// 3) 背景の板(--bd)を持つ章の直下に、写真や動画を置かない(2026-10-15: 閉幕の花火の板に RINKA の写真が重なった)。板の上に重ねる絵は札(figure 等)の中だけ
for (const f of pages) {
  const html = readFileSync(join(ROOT, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
  for (const m of html.matchAll(/<(section)\b([^>]*--bd:\s*url[^>]*)>([\s\S]*?)<\/section>/g)) {
    // 直下の要素だけを見る(panel-inner などの入れ物の中は対象外)
    const body = m[3].replace(/<(div|figure|a|nav|span|p|h[1-6])\b[\s\S]*?<\/\1>/g, '')
    const direct = body.match(/<(img|video)\b[^>]*>/g) || []
    for (const d of direct) bad.push(`${f}: 背景の板がある章の直下に写真/動画: ${d.slice(0, 70)}`)
  }
}

// 4) 内部リンクの行き先(頁と位置の印 #id)が実在するか(2026-10-15: トップを組み替えた後、#worlds・#works・#shows・#fin が行き先を失っていた)
{
  const { existsSync } = await import('node:fs')
  const { posix } = await import('node:path')
  const idsOf = new Map()
  const ids = (f) => { if (!idsOf.has(f)) idsOf.set(f, new Set([...readFileSync(join(ROOT, f), 'utf8').matchAll(/\bid="([^"]+)"/g)].map(m => m[1]))); return idsOf.get(f) }
  for (const f of pages) {
    const html = readFileSync(join(ROOT, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
    for (const m of html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
      const href = m[1]
      if (/^(https?:|mailto:|tel:|javascript:|\/\/)/.test(href) || href === '#') continue
      const [path, frag] = href.split('#')
      let tgt = path ? posix.normalize(posix.join(posix.dirname(f), path)) : f
      if (!path) tgt = f
      else if (path.endsWith('/') || tgt === '.' || tgt === 'usecases') tgt = posix.join(tgt === '.' ? '' : tgt, 'index.html')
      if (!existsSync(join(ROOT, tgt))) { bad.push(`${f}: リンクの頁が無い: ${href}`); continue }
      if (frag && tgt.endsWith('.html') && !ids(tgt).has(frag)) bad.push(`${f}: リンクの位置の印が無い: ${href}(${tgt} に #${frag} が無い)`)
    }
  }
}
// 5) 横展開の整合性(2026-10-15 ユーザー「横展開、整合性ちゃんと見るようにルール化して」。トップとスタジオの中だけ EN の札が抜けた実害)
//    全頁に共通の部品が揃っているかを機械で見る: 言語の札(ja/zh/en)・上の案内の項目・下の案内(用途の一覧)・辞書の読み込み・共通の台本と CSS の ?v=
//    基準は多数決ではなく「最初の頁」でもなく、全頁の和集合= どこか 1 頁にあって他に無いものは全部出す
{
  const shared = pages.filter(f => f !== 'links.html')   // links.html(made_linlin のリンク集)は別の作り
  const info = {}
  for (const f of shared) {
    const html = readFileSync(join(ROOT, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
    const sw = html.match(/<nav class="lang-switch"[\s\S]*?<\/nav>/)
    const langs = sw ? [...sw[0].matchAll(/data-lang="(\w+)"/g)].map(m => m[1]).sort() : []
    const nav = html.match(/<nav class="top-nav"[\s\S]*?<\/nav>/)
    const navItems = nav ? [...nav[0].matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim()) : []
    const fm = html.match(/<nav class="foot-map"[\s\S]*?<\/nav>/)
    // 下の案内は「用途の一覧」(usecases/ の頁への link)だけ比べる。works.html のように用途の一覧を持たない頁は対象外
    const fmItems = fm ? [...fm[0].matchAll(/href="([^"]+)"/g)].map(m => m[1]).filter(h => /(^|\/)(?!index)[a-z_]+\.html$/.test(h) && (h.includes('usecases/') || f.startsWith('usecases/')) && !/^(\.\.\/|\.\/)?(works|strengths|engineering)\.html/.test(h)).map(h => h.split('/').pop()).sort() : []
    const scripts = [...html.matchAll(/<script src="([^"?]+)\?v=([^"]+)"/g)].map(m => [m[1].split('/').pop(), m[2]])
    const css = [...html.matchAll(/css\/theater\.css\?v=([^"]+)/g)].map(m => m[1])
    info[f] = { langs, navItems, fmItems, scripts: Object.fromEntries(scripts), css: css[0] || '' }
  }
  const union = (k) => [...new Set(shared.flatMap(f => info[f][k]))].sort()
  for (const k of ['langs', 'navItems', 'fmItems']) {
    const all = union(k)
    for (const f of shared) {
      const miss = all.filter(x => !info[f][k].includes(x))
      if (info[f][k].length && miss.length) bad.push(`${f}: 横展開の漏れ(${{ langs: '言語の札', navItems: '上の案内', fmItems: '下の案内' }[k]}): ${miss.join(' ')} が無い`)
    }
  }
  // 辞書の読み込み: main.js の頁は en_main.js、uc_i18n.js の頁は en_uc.js を先に読む
  for (const f of shared) {
    const sc = info[f].scripts
    if (sc['main.js'] && !sc['en_main.js']) bad.push(`${f}: main.js の頁なのに js/en_main.js を読んでいない(英語が出ない)`)
    if (sc['uc_i18n.js'] && !sc['en_uc.js']) bad.push(`${f}: uc_i18n.js の頁なのに js/en_uc.js を読んでいない(英語が出ない)`)
    if (!sc['sitemenu.js']) bad.push(`${f}: js/sitemenu.js を読んでいない(地図と言語の同期が無い)`)
  }
  // 共通の台本と CSS の ?v= は全頁で同じ(一部だけ古い印= 直した版が届かない)
  for (const name of ['sitemenu.js', 'uc_i18n.js', 'main.js', 'en_main.js', 'en_uc.js']) {
    const vs = new Map()
    for (const f of shared) if (info[f].scripts[name]) vs.set(info[f].scripts[name], [...(vs.get(info[f].scripts[name]) || []), f])
    if (vs.size > 1) bad.push(`${name} の ?v= が頁で違う: ` + [...vs].map(([v, fs]) => `${v}(${fs.join(' ')})`).join(' / '))
  }
  const cssV = new Map(); for (const f of shared) if (info[f].css) cssV.set(info[f].css, [...(cssV.get(info[f].css) || []), f])
  if (cssV.size > 1) bad.push('theater.css の ?v= が頁で違う: ' + [...cssV].map(([v, fs]) => `${v}(${fs.join(' ')})`).join(' / '))
}
// 6) 写真の枠切れ(2026-10-15 ユーザー「写真が切れてる。何回も指摘してるので、これルール化して」): 枠(札・扉・冒頭・使いどころ・板)の写真で顔が枠の外に出ていないかを
//    顔検出で見る(tools/face_fit.py・PC とスマホの両方の比)。mvdirector の venv(cv2)がある Mac でだけ走る。GitHub Actions では飛ばす(手元で build を通してから push する規律)
{
  const { existsSync } = await import('node:fs')
  const { spawnSync } = await import('node:child_process')
  const py = '/Users/linsuyi/mvdirector/venv/bin/python'
  if (existsSync(py)) {
    const r = spawnSync(py, [join(ROOT, 'tools/face_fit.py'), '--check'], { encoding: 'utf8' })
    const out = (r.stdout || '') + (r.stderr || '')
    if (r.status !== 0) bad.push(...out.split('\n').filter(l => /顔が枠から出る/.test(l)).map(l => '写真の枠切れ: ' + l.trim()))
    else console.log(out.split('\n').filter(l => l.startsWith('face_fit')).join(' '))
  } else console.warn('★ face_fit(写真の枠切れ)は cv2 の無い環境では飛ばす')
}
// 7) 使わない写真(2026-10-15 ユーザー「この写真、使いたくない。美しくないから別にして」): data/excluded.json に載せた写真はどの頁でも参照できない。
//    一度「使わない」と決めた写真が、別の頁の差し替えで戻ってくるのを機械的に止める
{
  const { readFileSync, existsSync } = await import('node:fs')
  const exPath = join(ROOT, 'data/excluded.json')
  if (existsSync(exPath)) {
    const ex = JSON.parse(readFileSync(exPath, 'utf8')).assets || []
    for (const f of pages) {
      const src = readFileSync(join(ROOT, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
      for (const a of ex) if (src.includes(a.file.replace(/^assets\//, 'assets/'))) bad.push(`使わない写真を参照: ${f} → ${a.file}(${a.why})`)
    }
  }
}
if (bad.length) { console.error('★ DESIGN_RULES.md 違反(ビルドを止めた):\n  ' + bad.join('\n  ')); process.exit(1) }
console.log(`lint_design: ok(${pages.length} 頁)`)
