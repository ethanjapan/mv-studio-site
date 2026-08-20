// デプロイ用ビルド: 可読ソース -> dist/ に minify して出力する。
// リポジトリ内のソースは触らない。Pages が配信するのは dist/ のみ。
import { cp, mkdir, rm, readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { minify as minifyHtml } from 'html-minifier-terser'
import * as esbuild from 'esbuild'

const ROOT = import.meta.dirname
const DIST = join(ROOT, 'dist')

// dist に入れないもの（ソース専用・開発用・公開不要）
const EXCLUDE = new Set([
  'dist', 'node_modules', '.git', '.github',
  'build.mjs', 'package.json', 'package-lock.json',
  'README.md', '.gitignore',
  '.DS_Store', 'Thumbs.db',   // OS が撒くゴミ。配信するとファイル名が漏れる
  'js/world.js',              // どの HTML からも参照されていない死蔵ファイル
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
    const out = await minifyHtml(raw, HTML_OPTS)
    await writeFile(dst, out)
    report(rel, raw, out)
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

const b = saved.reduce((s, x) => s + x.before, 0)
const a = saved.reduce((s, x) => s + x.after, 0)
for (const x of saved.sort((p, q) => q.before - p.before)) {
  const pct = ((1 - x.after / x.before) * 100).toFixed(1)
  console.log(`${x.rel.padEnd(24)} ${String(x.before).padStart(7)} -> ${String(x.after).padStart(7)}  -${pct}%`)
}
console.log(`${'合計'.padEnd(23)} ${String(b).padStart(7)} -> ${String(a).padStart(7)}  -${((1 - a / b) * 100).toFixed(1)}%`)
