import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import postcss from '/Users/devin/dev/repos/zenbujapanese-monorepo/node_modules/.pnpm/postcss@8.5.28/node_modules/postcss/lib/postcss.mjs'
import tailwind from '/Users/devin/dev/repos/zenbujapanese-monorepo/node_modules/.pnpm/@tailwindcss+postcss@4.3.3/node_modules/@tailwindcss/postcss/dist/index.mjs'
import { build } from '/Users/devin/dev/repos/zenbujapanese-monorepo/node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/lib/main.js'

const here = fileURLToPath(new URL('.', import.meta.url))
mkdirSync(here + 'out', { recursive: true })
const from = here + 'src/theme.css'
const result = await postcss([tailwind()]).process(readFileSync(from, 'utf8'), { from })
const raw = result.css
const hosted = raw.replace(/(^|[}\s]):root\s*\{/g, '$1:root, :host {')
const properties = [...raw.matchAll(/@property[^{]+\{[^}]*\}/g)].map(m => m[0]).join('\n')
const px = hosted.replace(/(-?\d*\.?\d+)rem\b/g, (_, n) => `${+(n * 16).toFixed(4)}px`)
writeFileSync(here + 'out/a-raw.css', raw)
writeFileSync(here + 'out/b-host.css', hosted)
writeFileSync(here + 'out/c-host-px.css', px)
writeFileSync(here + 'out/properties.css', properties)
await build({
  entryPoints: [here + 'src/app.tsx'],
  bundle: true,
  format: 'iife',
  jsx: 'automatic',
  outfile: here + 'out/app.js',
  alias: { '@': here + '../../apps/web/src' },
  nodePaths: [here + 'node_modules'],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning'
})
console.log('css', raw.length, 'properties', properties.split('\n').length, 'rootBlocks', (raw.match(/:root/g) || []).length, 'hostMentions', (raw.match(/:host/g) || []).length)
