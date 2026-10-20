// デプロイ用ビルド: 可読ソース -> dist/ に minify して出力する。
// リポジトリ内のソースは触らない。Pages が配信するのは dist/ のみ。
import { cp, mkdir, rm, readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { minify as minifyHtml } from 'html-minifier-terser'
import * as esbuild from 'esbuild'
await import('./lint_design.mjs')   // デザインの決まり(DESIGN_RULES.md)。違反があればここで止まる
await import('./gen_i18n.mjs')    // 英語の辞書 data/i18n_en.tsv → js/en_main.js / js/en_uc.js(欠けがあれば止まる・2026-10-15)
await import('./gen_works.mjs')   // 作品・番組を data/works.json から index.html / works.html へ(生成物が古いまま配信されないように)
await import('./gen_shelves.mjs') // 棚の頁(物と場所 data/stills.json・美容 data/beauty.json)を生成(2026-10-15)
import { localize, sitemap, PAGES, LANGS } from './gen_lang_pages.mjs'   // 言語別の頁 /zh/ /en/ と canonical・hreflang・構造化データ・sitemap(2026-10-20)

const ROOT = import.meta.dirname
const DIST = join(ROOT, 'dist')

// dist に入れないもの（ソース専用・開発用・公開不要）
const EXCLUDE = new Set(['lint_design.mjs', 'DESIGN_RULES.md', 
  'dist', 'node_modules', '.git', '.github',
  'build.mjs', 'gen_works.mjs', 'gen_shelves.mjs', 'gen_i18n.mjs', 'gen_lang_pages.mjs', 'data', 'package.json', 'package-lock.json',
  'README.md', '.gitignore',
  '.DS_Store', 'Thumbs.db',   // OS が撒くゴミ。配信するとファイル名が漏れる
  'js/world.js',              // どの HTML からも参照されていない死蔵ファイル
  '_review',                  // 画像の目視チェック用(公開しない)
  'tools',                    // 作品の素材を作る台本(tools/new_work_assets.py・公開しない)
])

const HTML_OPTS = {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttributes: false,  // ?v= 付きの src/href を壊さない
  minifyCSS: true,                   // <style> と style="" を圧縮
  minifyJS: { compress: true, mangle: true },  // <script> を圧縮
  sortAttributes: true,
  sortClassName: true,
}

async function walk(dir, base = '') {
  const out = []
  for (const name of await readdir(dir)) {
    const rel = base ? `${base}/${name}` : name
    if (EXCLUDE.has(rel) || EXCLUDE.has(name)) continue
    const full = join(dir, name)
    if ((await stat(full)).isDirectory()) out.push(...await walk(full, rel))
    else out.push(rel)
  }
  return out
}

const saved = []
// 日本語コメントが多いので文字数ではなく UTF-8 バイト数で測る
function report(rel, before, after) {
  saved.push({
    rel,
    before: Buffer.byteLength(before, 'utf8'),
    after: Buffer.byteLength(after, 'utf8'),
  })
}

await rm(DIST, { recursive: true, force: true })
await mkdir(DIST, { recursive: true })

for (const rel of await walk(ROOT)) {
  const src = join(ROOT, rel)
  const dst = join(DIST, rel)
  await mkdir(join(dst, '..'), { recursive: true })
  const ext = extname(rel).toLowerCase()

  if (ext === '.html') {
    const raw = await readFile(src, 'utf8')
    const out = await minifyHtml(localize(raw, rel, 'ja'), HTML_OPTS)
    await writeFile(dst, out)
    report(rel, raw, out)
    if (PAGES.includes(rel)) for (const lang of LANGS) {   // 同じ頁の繁中・英語の版を /zh/ /en/ へ
      const ldst = join(DIST, lang, rel)
      await mkdir(join(ldst, '..'), { recursive: true })
      await writeFile(ldst, await minifyHtml(localize(raw, rel, lang), HTML_OPTS))
    }
  } else if (ext === '.js') {
    const raw = await readFile(src, 'utf8')
    // target を下げると ?. や ?? が展開されて逆に肥大化する。
    // charset 既定の ascii は日本語を \uXXXX に展開して1文字6バイトにするので utf8 必須。
    const { code } = await esbuild.transform(raw, {
      loader: 'js', minify: true, legalComments: 'none',
      target: 'esnext', charset: 'utf8',
    })
    await writeFile(dst, code)
    report(rel, raw, code)
  } else if (ext === '.css') {
    const raw = await readFile(src, 'utf8')
    const { code } = await esbuild.transform(raw, {
      loader: 'css', minify: true, legalComments: 'none', charset: 'utf8',
    })
    await writeFile(dst, code)
    report(rel, raw, code)
  } else {
    await cp(src, dst)   // 画像・動画・音声はそのまま
  }
}

await writeFile(join(DIST, 'sitemap.xml'), sitemap())
console.log(`言語別の頁: ${PAGES.length} 頁 x ${LANGS.join('/')} = ${PAGES.length * LANGS.length} 枚・sitemap.xml ${PAGES.length * 3} URL`)

const b = saved.reduce((s, x) => s + x.before, 0)
const a = saved.reduce((s, x) => s + x.after, 0)
for (const x of saved.sort((p, q) => q.before - p.before)) {
  const pct = ((1 - x.after / x.before) * 100).toFixed(1)
  console.log(`${x.rel.padEnd(24)} ${String(x.before).padStart(7)} -> ${String(x.after).padStart(7)}  -${pct}%`)
}
console.log(`${'合計'.padEnd(23)} ${String(b).padStart(7)} -> ${String(a).padStart(7)}  -${((1 - a / b) * 100).toFixed(1)}%`)
