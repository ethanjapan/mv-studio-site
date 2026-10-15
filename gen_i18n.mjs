// 英語の辞書の生成器(2026-10-15・ユーザー「英語版も用意して。直訳ではなくネイティブな英語で」)。
//   data/i18n_en/*.tsv(正本・頁ごとに分ける: 1 行= 日本語の文 <TAB> 英語の文 [<TAB> main|uc= その辞書だけに効く]。# で始まる行と空行は飛ばす)から
//   同じ日本語が頁によって違う英語になる時(「衣装」= Outfit / garments)は 3 列目で適用先を分ける
//   js/en_main.js(window.MV_EN_MAIN= トップ・作品一覧・仕組み・つくりかた・スタジオの中= main.js の辞書の鍵)
//   js/en_uc.js  (window.MV_EN_UC= 用途の頁= uc_i18n.js の辞書の鍵)
// を書く。繁中の辞書(main.js / uc_i18n.js の M)に鍵があって英語に無ければ、その鍵を列挙してビルドを止める(英語だけ日本語のまま出るのを防ぐ)。
// 使い方: node gen_i18n.mjs  (build.mjs が gen_works より先に呼ぶ= 作品一覧の固定文の英語を gen_works が写すため)
//   I18N_EN_ALLOW_MISSING=1 で欠けを警告止まりにする(書きかけの時だけ)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(fileURLToPath(import.meta.url))
function dictOf(file) {   // main.js / uc_i18n.js の繁中の辞書 M の鍵(gen_works.mjs と同じ取り出し方)
  const src = readFileSync(join(ROOT, file), 'utf8')
  const head = 'const M=Object.assign({},{'
  const s0 = src.indexOf(head), s1 = src.indexOf('\n  },window.MV_WORKS_I18N', s0)
  if (s0 < 0 || s1 < 0) throw new Error(`${file} の辞書 M が見つからない(形が変わった)`)
  return (0, eval)('(' + src.slice(s0 + head.length - 1, s1).trim() + '})')
}
const EN = {}, EN_SCOPED = { main: {}, uc: {} }
const TSVS = readdirSync(join(ROOT, 'data/i18n_en')).filter(f => f.endsWith('.tsv')).sort()
const lines = TSVS.flatMap(f => readFileSync(join(ROOT, 'data/i18n_en', f), 'utf8').split('\n').map((l, i) => [`${f}:${i + 1}`, l]))
let dup = 0
for (const [where, raw] of lines) {
  const line = raw.replace(/\r$/, '')
  if (!line.trim() || line.startsWith('#')) continue
  const t = line.indexOf('\t')
  if (t < 0) throw new Error(`${where}: タブが無い: ${line.slice(0, 40)}`)
  const cols = line.split('\t')
  const ja = cols[0].trim(), en = (cols[1] || '').trim(), scope = (cols[2] || '').trim()
  if (!en) throw new Error(`${where}: 英語が空: ${ja.slice(0, 40)}`)
  if (scope && scope !== 'main' && scope !== 'uc') throw new Error(`${where}: 3 列目は main か uc: ${scope}`)
  const bucket = scope ? EN_SCOPED[scope] : EN
  if (bucket[ja] != null && bucket[ja] !== en) dup++
  bucket[ja] = en
}
const out = []
for (const [file, name, jsFile] of [['js/main.js', 'MV_EN_MAIN', 'js/en_main.js'], ['js/uc_i18n.js', 'MV_EN_UC', 'js/en_uc.js']]) {
  const M = dictOf(file)
  const d = {}, missing = []
  const scoped = EN_SCOPED[name === 'MV_EN_MAIN' ? 'main' : 'uc']
  for (const ja of Object.keys(M)) {   // 鍵は trim で突き合わせる(辞書の鍵に先頭の空白があるものが 1 つある)
    const k = ja.trim(), v = scoped[k] != null ? scoped[k] : EN[k]
    if (v != null) d[ja] = v; else missing.push(ja)
  }
  for (const [k, v] of Object.entries(scoped)) if (d[k] == null) d[k] = v   // 適用先つきの鍵は辞書(M)に無くても入れる= 頁の <title> など
  if (missing.length) {
    const msg = `${file} の鍵 ${missing.length} 件に英語が無い(data/i18n_en/*.tsv):\n  ` + missing.slice(0, 40).join('\n  ') + (missing.length > 40 ? `\n  …ほか ${missing.length - 40} 件` : '')
    if (process.env.I18N_EN_ALLOW_MISSING === '1') console.warn('★' + msg); else throw new Error(msg)
  }
  const js = `/* 生成物: node gen_i18n.mjs が data/i18n_en/*.tsv から書く(手で編集しない)。${file} の辞書の鍵の英語 */\nwindow.${name}=${JSON.stringify(d)};\n`
  let old = ''; try { old = readFileSync(join(ROOT, jsFile), 'utf8') } catch {}
  if (old !== js) { writeFileSync(join(ROOT, jsFile), js); out.push(`${jsFile} を書き換え`) }
  out.push(`${jsFile}: ${Object.keys(d).length} 件(欠け ${missing.length})`)
}
const known = new Set([...Object.keys(dictOf('js/main.js')), ...Object.keys(dictOf('js/uc_i18n.js'))])
const knownT = new Set([...known].map(k => k.trim()))
const unknown = Object.keys(EN).filter(k => !knownT.has(k))
if (unknown.length) console.warn(`★i18n_en.tsv に辞書に無い鍵 ${unknown.length} 件(日本語の写し間違いか、生成物の鍵):\n  ` + unknown.slice(0, 30).join('\n  '))
if (dup) console.warn(`★i18n_en.tsv に同じ鍵で違う英語 ${dup} 件(後の行が勝つ)`)
console.log(out.join(' / '))
