import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Dictionary } from '@zenbu/dictionary-core/artifact/dictionary'
import { kanjiCandidateRows, readKanji } from '@zenbu/dictionary-core/artifact/kanji'
import { conjugationTable } from '@zenbu/dictionary-core/detail/conjugation'
import { examplesPerPage } from '@zenbu/dictionary-core/detail/examples'
import type {
  ExampleSentenceRow,
  FormExampleRows,
  WordExampleRows
} from '@zenbu/dictionary-core/detail/rows'
import { artifactFile, fileSha256, openArtifact } from '../src/artifact'
import { loadKuromoji } from '../src/kuromoji'

const serviceDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const output = join(serviceDir, '../../packages/dictionary-core/src/fixtures')

const entryNumbers = [
  1546640, 1577980, 1465580, 1391500, 1322180, 1587780, 1609600, 2188720, 1546750, 1546680, 1546850,
  1612150
]
const kanjiCharacters = ['要']
const examplesPerWord = 2 * examplesPerPage

function writeOneRowPerLine(name: string, rows: unknown[]) {
  const lines = rows.map(row => JSON.stringify(row)).join(',\n')
  writeFileSync(join(output, name), `[\n${lines}\n]\n`)
}

const resources = resolve(
  process.argv[2] ?? join(serviceDir, '../ios/Modules/Sources/SearchExperience/Resources')
)
const artifact = openArtifact(resources, await fileSha256(join(resources, artifactFile)))
const dictionary = new Dictionary({
  db: artifact.db,
  kanji: artifact.kanji,
  capabilities: { tokenize: loadKuromoji(join(resources, 'Kuromoji')) }
})

const words = []
const examples: WordExampleRows[] = []
const formExamples = new Map<string, FormExampleRows[]>()
const counts = []
for (const entSeq of entryNumbers) {
  const word = dictionary.word(entSeq)
  if (!word) {
    console.error(`Skipping entry ${entSeq}: not in LanguageReferenceData`)
    continue
  }
  const { examples: first, exampleCount, ...rows } = word.rows
  words.push(rows)
  const more = dictionary.wordExamples(entSeq, first.length, examplesPerWord - first.length)
  examples.push(...first, ...(more?.rows ?? []))
  if (exampleCount) {
    counts.push({ entSeq, ...exampleCount, listed: Math.min(exampleCount.listed, examplesPerWord) })
  }
  const table = conjugationTable(rows.entry)
  for (const form of table ? [...table.plain, ...table.polite] : []) {
    if (!formExamples.has(form.surface)) {
      formExamples.set(form.surface, dictionary.formExamples(form.surface, 0, examplesPerWord).rows)
    }
  }
}
writeOneRowPerLine('words.json', words)
examples.sort((left, right) => left.example.entSeq - right.example.entSeq)
writeOneRowPerLine(
  'word-examples.json',
  examples.map(({ example }) => example)
)
const forms = [...formExamples.keys()].sort()
writeOneRowPerLine(
  'form-examples.json',
  forms.flatMap(surface => (formExamples.get(surface) ?? []).map(({ example }) => example))
)
const sentences = new Map<number, ExampleSentenceRow>()
for (const { sentence } of [...examples, ...[...formExamples.values()].flat()]) {
  sentences.set(sentence.id, sentence)
}
writeOneRowPerLine(
  'example-sentences.json',
  [...sentences.values()].sort((left, right) => left.id - right.id)
)
writeOneRowPerLine(
  'example-counts.json',
  counts.sort((left, right) => left.entSeq - right.entSeq)
)

const kanji = []
const kanjiWords = []
for (const character of kanjiCharacters) {
  const rows = readKanji(artifact.db, artifact.kanji, character)
  if (!rows) {
    console.error(`Skipping kanji ${character}: not in KanjiReferenceData`)
    continue
  }
  const { words: _ordered, ...rest } = rows
  kanji.push(rest)
  kanjiWords.push(
    ...kanjiCandidateRows(artifact.db, character).map(word => ({ kanji: character, ...word }))
  )
}
writeOneRowPerLine('kanji.json', kanji)
writeOneRowPerLine('kanji-words.json', kanjiWords)
artifact.close()
