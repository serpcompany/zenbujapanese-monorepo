import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const [language, ...keys] = process.argv.slice(2)
const usage = 'Usage: pnpm i18n:stamp <language> <key>… (or --all for every key)'
if (!language || keys.length === 0) {
  process.stderr.write(`${usage}\n`)
  process.exit(2)
}

const readJson = url => JSON.parse(readFileSync(url, 'utf8'))
const english = readJson(new URL('../src/lib/i18n/dictionaries/en.json', import.meta.url))
const reviewPath = new URL(`../content/reviews/${language}.json`, import.meta.url)
const review = readJson(reviewPath)

function leaves(value, path = '') {
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, path ? `${path}.${key}` : key)
    )
  }
  return [[path, value]]
}

const checksum = text => createHash('sha256').update(text).digest('hex').slice(0, 12)
const source = new Map(leaves(english))
const named = keys.includes('--all') ? [...source.keys()] : keys
const unknown = named.filter(key => !source.has(key))
if (unknown.length > 0) {
  process.stderr.write(`No such key in en.json: ${unknown.join(', ')}\n`)
  process.exit(1)
}
const sourceChecksums = { ...review.sourceChecksums }
for (const key of Object.keys(sourceChecksums)) if (!source.has(key)) delete sourceChecksums[key]
for (const key of named) sourceChecksums[key] = checksum(String(source.get(key)))
const ordered = Object.fromEntries(
  [...source.keys()].filter(key => key in sourceChecksums).map(key => [key, sourceChecksums[key]])
)
writeFileSync(reviewPath, `${JSON.stringify({ ...review, sourceChecksums: ordered }, null, 2)}\n`)
process.stdout.write(`Stamped ${named.length} ${language} strings against their English.\n`)
