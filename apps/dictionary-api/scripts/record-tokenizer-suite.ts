import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  foundTokens,
  sampleDigest,
  sampleTexts,
  tokenFields
} from '@zenbu/dictionary-core/examples/ipadic.fixture'
import { loadTokenizer } from '../src/tokenizer'

const repository = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..')
const resources = join(repository, 'apps/ios/Modules/Sources/SearchExperience/Resources')
const path = join(repository, 'language-data/conformance/tokenizer.json')
const suite = JSON.parse(readFileSync(path, 'utf8')) as {
  artifacts: { name: string }[]
  sample: { pieces: string[]; texts: number; seed: number }
  cases: { text: string }[]
}
const tokenize = loadTokenizer(join(resources, 'Kuromoji'))

const artifacts = suite.artifacts.map(({ name }) => ({
  name,
  sha256: createHash('sha256')
    .update(readFileSync(join(resources, name)))
    .digest('hex')
}))
const { pieces, texts, seed } = suite.sample
const sample = {
  pieces,
  texts,
  seed,
  digest: sampleDigest(tokenize, sampleTexts(pieces, texts, seed))
}
const cases = suite.cases.map(({ text }) => {
  const found = foundTokens(tokenize, text)
  return found === 'refused' ? { text, refused: true } : { text, tokens: found }
})
const onePerLine = (rows: unknown[]) => rows.map(row => `    ${JSON.stringify(row)}`).join(',\n')

writeFileSync(
  path,
  [
    '{',
    '  "suite": "tokenizer",',
    '  "formatVersion": 1,',
    '  "artifacts": [',
    onePerLine(artifacts),
    '  ],',
    `  "fields": ${JSON.stringify(tokenFields)},`,
    `  "sample": ${JSON.stringify(sample)},`,
    '  "cases": [',
    onePerLine(cases),
    '  ]',
    '}',
    ''
  ].join('\n')
)
