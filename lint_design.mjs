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
if (bad.length) { console.error('★ DESIGN_RULES.md 違反(ビルドを止めた):\n  ' + bad.join('\n  ')); process.exit(1) }
console.log(`lint_design: ok(${pages.length} 頁)`)
