import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { build } from 'esbuild'

const fts4 = process.env.SQLITE === 'fts4'
const compressed = process.env.COMPRESSED === '1'
const stopAfter = process.env.RESUME ? Number(process.env.RESUME) : null
const out = `${fts4 ? 'dist-fts4' : 'dist'}${compressed ? '-gz' : ''}${stopAfter ? '-resume' : ''}`
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
cpSync('ext', out, { recursive: true })
const sqliteDir = fts4 ? 'vendor/sqlite-fts4' : 'node_modules/@sqlite.org/sqlite-wasm/dist'
cpSync(`${sqliteDir}/sqlite3.wasm`, `${out}/sqlite3.wasm`)
const alias = fts4 ? { '@sqlite.org/sqlite-wasm': './vendor/sqlite-fts4/sqlite3.mjs' } : {}
await build({
  entryPoints: { worker: 'src/worker.ts', offscreen: 'src/offscreen.ts', background: 'src/background.ts', sidepanel: 'src/sidepanel.ts', probe: 'src/probe.ts', 'probe-worker': 'src/probe-worker.ts' },
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  outdir: out,
  alias,
  define: { __SPIKE__: JSON.stringify({ compressed, stopAfter }) },
  logLevel: 'warning'
})
await build({ entryPoints: { content: 'src/content.ts' }, bundle: true, format: 'iife', target: 'chrome120', outdir: out, logLevel: 'warning' })
console.log(`built ${out}`)
