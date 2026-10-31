// ネイティブの見直しの道具(2026-10-31 ユーザー「私の指摘に対する再発防止は？」→「作って」)
// 直訳の検査(lint_translation)は「印」しか見ないので、語は正しいのに訳した調子の文(例「每天早上的作品」)を止められなかった
// (指摘を受けた最初の訳文 約 100 行のうち 3 行しか当たらなかった)。そこで、繁中と英語の文は
// 「書いた本人とは別の担当が、ネイティブの書き手として見直した記録」が無いとビルドが止まる形にした。
//
// 使い方:
//   node review_translation.mjs pending [--out <file>]   見直しが要る文を JSON で出す(id・言語・日本語の元・文・場所)
//   node review_translation.mjs apply <file>             見直し役の結果を取り込む。書き直しは元のファイルへ戻し、生成器を回して記録する
//   node review_translation.mjs legacy-init <古い木>     その時点で公開済みだった文を「旧来」として記録する(一度だけ・2026-10-31 に 5d6969b で実施)
//
// 結果の file の形(見直し役が返す): {"reviewer":"subagent:<名前>","items":[{"id":"…","verdict":"ok"|"rewrite","text":"書き直した文(rewrite の時)","note":"理由"}]}
//   ★ 結果は必ず別の担当(サブエージェント)の出力をそのまま使う。書いた本人が ok を付けて流し込まない(docs/translation-review-brief.md)
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { inventory, unreviewed, hashText } from './lint_translation.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const RP = join(ROOT, 'data/translation_reviewed.json')
const load = () => existsSync(RP) ? JSON.parse(readFileSync(RP, 'utf8')) : { _note: '', legacy: [], reviewed: {} }
const save = (r) => {
  r._note = 'ネイティブの見直しの記録(review_translation.mjs・lint_translation が照らす)。鍵= sha1(言語 + 改行 + 文)。legacy= 2026-10-31 より前に公開済みの文(見直しは未・あとで順に通す)/ reviewed= 別の担当が見直して通した文'
  r.legacy = [...new Set(r.legacy)].sort()
  writeFileSync(RP, JSON.stringify(r, null, 1) + '\n')
}
const today = new Date().toISOString().slice(0, 10)
const [cmd, arg, arg2] = process.argv.slice(2)

if (cmd === 'pending') {
  const p = unreviewed(ROOT)
  const out = JSON.stringify({ site: 'mv-studio-site', count: p.length, brief: 'docs/translation-review-brief.md', items: p }, null, 1)
  const o = arg === '--out' ? arg2 : null
  if (o) { writeFileSync(o, out); console.log(`見直しが要る文 ${p.length} 件 → ${o}`) } else console.log(out)
} else if (cmd === 'legacy-init') {
  if (!arg || !existsSync(join(arg, 'js/main.js'))) { console.error('古い木(git archive で展開した頁の一式)の場所を渡す'); process.exit(2) }
  const inv = inventory(arg), r = load()
  const hs = [...inv.zh.map(x => hashText('zh', x[1])), ...inv.en.map(x => hashText('en', x[1]))]
  r.legacy.push(...hs); save(r)
  console.log(`旧来として記録 ${new Set(hs).size} 件(繁中 ${inv.zh.length} / 英語 ${inv.en.length} 文)`)
} else if (cmd === 'apply') {
  const res = JSON.parse(readFileSync(arg, 'utf8'))
  if (!res.reviewer || !/^subagent/.test(res.reviewer)) { console.error('結果の reviewer が subagent:… でない= 別の担当の見直しではない。取り込まない'); process.exit(2) }
  const pend = new Map(unreviewed(ROOT).map(p => [p.id, p]))
  const r = load(), miss = [], done = { ok: 0, rewrite: 0 }
  for (const it of res.items) {
    const p = pend.get(it.id)
    if (!p) { miss.push(`${it.id.slice(0, 8)}: 見直し待ちに無い(もう通っているか、文が変わった)`); continue }
    if (it.verdict === 'ok') {
      r.reviewed[p.id] = { lang: p.lang, text: p.text, date: today, by: res.reviewer, verdict: 'ok' }; done.ok++
    } else if (it.verdict === 'rewrite' && it.text && it.text.trim()) {
      const n = writeback(p.lang, p.ja, p.text, it.text.trim())
      if (!n) { miss.push(`${p.id.slice(0, 8)}: 元の場所が見つからない(${p.where[0]})= 手で直す → 「${it.text.trim().slice(0, 40)}」`); continue }
      r.reviewed[hashText(p.lang, it.text)] = { lang: p.lang, text: it.text.trim(), date: today, by: res.reviewer, verdict: 'rewrite', was: p.text, note: it.note || '' }; done.rewrite++
    } else miss.push(`${it.id.slice(0, 8)}: verdict が ok / rewrite でない`)
  }
  save(r)
  for (const g of ['gen_shelves.mjs', 'gen_daily.mjs', 'gen_i18n.mjs']) execSync(`node ${g}`, { cwd: ROOT, stdio: 'ignore' })
  console.log(`取り込み: そのまま ${done.ok} / 書き直し ${done.rewrite} / 取り込めない ${miss.length}`)
  if (miss.length) console.log('  ' + miss.join('\n  '))
  const left = unreviewed(ROOT).length
  console.log(`残りの見直し待ち ${left} 件`)
} else {
  console.log('使い方: node review_translation.mjs pending [--out file] | apply <file> | legacy-init <古い木>')
}

// 書き直しを元のファイルへ戻す。生成物(js/*_i18n.js・js/en_*.js)は触らず、正本(辞書 M・英語の TSV・data の JSON)を直す
function writeback(lang, ja, old, neu) {
  let n = 0
  if (lang === 'en') for (const f of readdirSync(join(ROOT, 'data/i18n_en')).filter(f => f.endsWith('.tsv'))) {
    const p = join(ROOT, 'data/i18n_en', f), src = readFileSync(p, 'utf8')
    const o = src.split('\n').map(l => { const c = l.split('\t'); if (c.length >= 2 && c[1] === old && (!ja || c[0] === ja)) { c[1] = neu; n++ } return c.join('\t') }).join('\n')
    if (o !== src) writeFileSync(p, o)
  }
  if (lang === 'zh') for (const f of ['js/main.js', 'js/uc_i18n.js']) {
    const p = join(ROOT, f), src = readFileSync(p, 'utf8'), a = `${JSON.stringify(ja)}:${JSON.stringify(old)}`
    if (src.includes(a)) { writeFileSync(p, src.split(a).join(`${JSON.stringify(ja)}:${JSON.stringify(neu)}`)); n++ }
  }
  for (const f of readdirSync(join(ROOT, 'data')).filter(f => f.endsWith('.json') && !/^translation_/.test(f))) {
    const p = join(ROOT, 'data', f), src = readFileSync(p, 'utf8'); let d
    try { d = JSON.parse(src) } catch { continue }
    let k = 0
    const walk = (o, parent) => {
      if (Array.isArray(o)) { o.forEach(x => walk(x, parent)); return }
      if (!o || typeof o !== 'object') return
      for (const key of Object.keys(o)) {
        const v = o[key]
        if (typeof v === 'string' && v === old && (key === lang || key === `sub_${lang}` || (parent === lang && ['description', 'og'].includes(key)))) { o[key] = neu; k++ }
        else if (parent === 'strings' && Array.isArray(v) && key === ja && v[lang === 'zh' ? 0 : 1] === old) { v[lang === 'zh' ? 0 : 1] = neu; k++ }
        else walk(v, key)
      }
    }
    walk(d, '')
    if (k) { const ind = (src.match(/\n( +)"/) || [, ' '])[1].length; writeFileSync(p, JSON.stringify(d, null, ind) + '\n'); n += k }
  }
  return n
}
