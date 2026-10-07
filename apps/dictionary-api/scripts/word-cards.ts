import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exportWordCards, wordCardInputs } from '@zenbu/dictionary-core/artifact/word-cards'
import { parseWordList } from '@zenbu/dictionary-core/cards/word-list'
import { artifactFile, fileSha256, openArtifact } from '../src/artifact'

const repository = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..')
const usage = 'pnpm --filter zenbujapanese-dictionary-api word-cards <word list> <output folder>'
const fromCaller = (path: string) => resolve(process.env.INIT_CWD ?? process.cwd(), path)

interface ReleaseInputs {
  roots: Record<string, string>
  files: { name: string; path: string }[]
}

function releaseFile(inputs: ReleaseInputs, name: string): string {
  const file = inputs.files.find(candidate => candidate.name === name)
  if (!file) throw new Error(`language-data/release-inputs.json lists no ${name}`)
  const [root, ...rest] = file.path.split('/')
  return join(repository, inputs.roots[root], ...rest)
}

const [listPath, outputPath] = process.argv.slice(2)
if (!listPath || !outputPath) {
  console.error(`Usage: ${usage}`)
  process.exit(2)
}

const list = parseWordList(readFileSync(fromCaller(listPath), 'utf8'))
const inputs = JSON.parse(
  readFileSync(join(repository, 'language-data/release-inputs.json'), 'utf8')
) as ReleaseInputs
const { release } = JSON.parse(
  readFileSync(join(repository, 'language-data/release.json'), 'utf8')
) as { release: string }
const resources = join(repository, inputs.roots.resources)
const files = Object.fromEntries(
  await Promise.all(
    wordCardInputs.map(async name => [name, await fileSha256(join(resources, name))] as const)
  )
)
const sha256 = files[artifactFile]
const artifact = openArtifact(resources, sha256)
const exported = exportWordCards(artifact.db, artifact.kanji, { release, files }, list.queries)
artifact.close()

const output = fromCaller(outputPath)
rmSync(join(output, 'notices'), { recursive: true, force: true })
mkdirSync(join(output, 'notices'), { recursive: true })
writeFileSync(join(output, 'word-cards.json'), `${JSON.stringify(exported, null, 2)}\n`)
for (const { notice } of exported.sources) {
  copyFileSync(releaseFile(inputs, notice), join(output, 'notices', notice))
}

const describe = (query: (typeof list.queries)[number]) =>
  'languageReferenceID' in query ? query.languageReferenceID : `${query.headword} ${query.reading}`
for (const { line, text } of list.unreadable) console.error(`Line ${line} unreadable: ${text}`)
for (const query of exported.unresolved) console.error(`Unresolved: ${describe(query)}`)
for (const { query, candidates } of exported.ambiguous) {
  const named = candidates.map(c => `${c.languageReferenceID} ${c.headword} ${c.reading}`)
  console.error(`Ambiguous: ${describe(query)}, one of ${named.join('; ')}`)
}
console.log(
  `${exported.cards.length} cards for ${list.queries.length} words in ${join(output, 'word-cards.json')}, ` +
    `with ${exported.ambiguous.length} ambiguous, ${exported.unresolved.length} unresolved, and ` +
    `${list.unreadable.length} unreadable lines; language data ${release} (${sha256.slice(0, 12)})`
)
const incomplete =
  list.unreadable.length + exported.ambiguous.length + exported.unresolved.length > 0
process.exitCode = incomplete ? 1 : 0
