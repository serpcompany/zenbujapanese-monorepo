import { readFileSync } from 'node:fs'
import {
  type ConjugationMode,
  type Conjugations,
  conjugations,
  sharedSpellingNote
} from '@zenbu/dictionary-core/detail/conjugation'
import { rubySegments } from '@zenbu/dictionary-core/detail/ruby'
import type { SuiteConjugations } from '@zenbu/dictionary-core/detail/suite'
import { wordDetail } from '@zenbu/dictionary-core/detail/word'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { dictionaryDatabase } from '@/lib/dictionary/dictionary-db'
import {
  ConjugatedFormContent,
  ConjugationTableContent,
  type ConjugationWord
} from './conjugations'
import { readConjugatedForm, readConjugationTable } from './rendered-word'
import { WordHeader } from './word-header'

// Renders the conjugation table and each form's screen to HTML, as the server does, and reads
// back what a reader sees: the header's meaning and rule, the Plain/Polite control, each row's
// title, form, and highlighted ending, and each form's meaning, shared spelling, and furigana. The
// first tests render fixed data; the last runs every word-detail.json case with a table through
// the dictionary database and the detail core into the components (ZENBU_DICTIONARY_D1=1, part of
// the dictionary import's gate).

const noReadings = new Map()

function table(word: ConjugationWord, data: Conjugations, mode: ConjugationMode) {
  return renderToStaticMarkup(
    <ConjugationTableContent
      word={word}
      conjugations={data}
      mode={mode}
      onModeChange={() => {}}
      onSelect={() => {}}
    />
  )
}

const miru = conjugations(
  { headword: '見る', reading: 'みる', partsOfSpeech: ['ichidanVerb', 'transitive'] },
  noReadings
) as Conjugations
const miruWord: ConjugationWord = {
  ruby: rubySegments('見る', 'みる'),
  reading: 'みる',
  summary: 'to see, to look, to watch, to view, to observe',
  partOfSpeech: 'Ichidan verb (transitive)',
  pitch: null
}

describe('the conjugation table', () => {
  test('shows the word, its rule, the register control, and each form with its ending', () => {
    const plain = readConjugationTable(table(miruWord, miru, 'Plain'))
    expect(plain.summary).toBe('to see, to look, to watch, to view, to observe')
    expect(plain.rule).toBe('Drop る, then add the ending.')
    expect(plain.modes).toEqual(['Plain', 'Polite'])
    expect(plain.rows.slice(0, 3)).toEqual([
      {
        kind: 'present-future',
        title: 'Present/Future',
        surface: '見る',
        ending: 'る',
        rowFurigana: false
      },
      { kind: 'past', title: 'Past', surface: '見た', ending: 'た', rowFurigana: false },
      { kind: 'negative', title: 'Negative', surface: '見ない', ending: 'ない', rowFurigana: false }
    ])
    const polite = readConjugationTable(table(miruWord, miru, 'Polite'))
    expect(polite.rows[0]).toMatchObject({ surface: '見ます', ending: 'ます' })
  })

  test('an adjective has no register control', () => {
    const shizuka = conjugations(
      { headword: '静か', reading: 'しずか', partsOfSpeech: ['naAdjective'] },
      noReadings
    ) as Conjugations
    const html = table({ ...miruWord, ruby: rubySegments('静か', 'しずか') }, shizuka, 'Plain')
    expect(html).not.toContain('data-conjugation-mode')
    expect(readConjugationTable(html).rows.map(row => row.surface)).toEqual([
      '静か',
      '静かな',
      '静かで',
      '静かに',
      '静かさ'
    ])
  })

  test('shows furigana on a row only when its ending has kanji (来させる)', () => {
    const kuru = conjugations(
      { headword: '来る', reading: 'くる', partsOfSpeech: ['kuruVerb'] },
      noReadings
    ) as Conjugations
    const rows = readConjugationTable(table(miruWord, kuru, 'Plain')).rows
    expect(rows.find(row => row.kind === 'causative')).toEqual({
      kind: 'causative',
      title: 'Causative',
      surface: '来させる',
      ending: '来させる',
      rowFurigana: true
    })
  })

  test('a form’s screen says what it means, and which forms share its spelling', () => {
    const potential = miru.rows.Plain.find(row => row.kind === 'potential')
    if (!potential) throw new Error('No potential form')
    const form = readConjugatedForm(renderToStaticMarkup(<ConjugatedFormContent row={potential} />))
    expect(form).toEqual({
      explanation:
        'Expresses ability or possibility: that someone can do the action or that the action is possible.',
      sharedSpelling: 'Same spelling as Passive. Context tells them apart.',
      furigana: [{ base: '見', reading: 'み' }, { base: 'られる' }],
      ending: 'られる'
    })
  })

  test('sharedSpellingNote lists titles as the app’s list format does', () => {
    expect(sharedSpellingNote(['Passive'])).toBe(
      'Same spelling as Passive. Context tells them apart.'
    )
    expect(sharedSpellingNote(['A', 'B'])).toBe(
      'Same spelling as A and B. Context tells them apart.'
    )
    expect(sharedSpellingNote(['A', 'B', 'C'])).toBe(
      'Same spelling as A, B, and C. Context tells them apart.'
    )
  })

  test('the part-of-speech row opens the table only when the word has one', () => {
    const header = (data: Conjugations | null) =>
      renderToStaticMarkup(
        <WordHeader
          ruby={miruWord.ruby}
          reading="みる"
          summary=""
          pitch={null}
          partOfSpeech="Ichidan verb (transitive)"
          conjugations={data}
        />
      )
    expect(header(miru)).toContain('data-opens-conjugations')
    expect(header(null)).not.toContain('data-opens-conjugations')
  })
})

const enabled = process.env.ZENBU_DICTIONARY_D1 === '1'

interface SuiteCase {
  covers: string
  entSeq: string[]
  opensConjugations: boolean
  conjugations?: SuiteConjugations
}

const suiteCases: SuiteCase[] = enabled
  ? (
      JSON.parse(
        readFileSync(
          new URL('../../../../ios/LanguageData/Conformance/word-detail.json', import.meta.url),
          'utf8'
        )
      ) as { cases: SuiteCase[] }
    ).cases
  : []

describe.runIf(enabled)('the rendered conjugation table matches the app', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<CloudflareEnv>>>
  let dictionary: ReturnType<typeof dictionaryDatabase>

  beforeAll(async () => {
    proxy = await getPlatformProxy<CloudflareEnv>({
      persist: { path: `${process.env.ZENBU_DICTIONARY_D1_PATH ?? '.dictionary-d1'}/v3` }
    })
    if (!proxy.env.DICTIONARY_DB)
      throw new Error('wrangler.jsonc has no local DICTIONARY_DB binding')
    dictionary = dictionaryDatabase(proxy.env.DICTIONARY_DB)
  })

  afterAll(async () => {
    await proxy?.dispose()
  })

  test.each(suiteCases)('$covers', async expected => {
    const word = await dictionary.word(Number(expected.entSeq[0]))
    if (!word) throw new Error(`No word ${expected.entSeq[0]}`)
    const detail = wordDetail(word.rows)
    // The part-of-speech row opens the table exactly when the app's does.
    const header = renderToStaticMarkup(
      <WordHeader
        ruby={detail.ruby}
        reading={detail.reading}
        summary={detail.summary}
        pitch={detail.pitch}
        partOfSpeech={detail.partOfSpeech}
        conjugations={detail.conjugations}
      />
    )
    expect(header.includes('data-opens-conjugations')).toBe(expected.opensConjugations)
    const suite = expected.conjugations
    if (!suite || !detail.conjugations) {
      expect(detail.conjugations).toBeNull()
      return
    }
    const data = detail.conjugations
    const word_: ConjugationWord = {
      ruby: detail.ruby,
      reading: detail.reading,
      summary: detail.summary,
      partOfSpeech: detail.partOfSpeech,
      pitch: detail.pitch
    }
    const registers: [ConjugationMode, SuiteConjugations['plain']][] = [
      ['Plain', suite.plain],
      ...(suite.polite
        ? [['Polite', suite.polite] as [ConjugationMode, SuiteConjugations['plain']]]
        : [])
    ]
    for (const [mode, forms] of registers) {
      const drawn = readConjugationTable(table(word_, data, mode))
      expect({ summary: drawn.summary, rule: drawn.rule, modes: drawn.modes }).toEqual({
        summary: suite.summary,
        rule: suite.rule,
        modes: suite.modes
      })
      expect(drawn.rows).toEqual(
        forms.map(({ kind, title, surface, ending, rowFurigana }) => ({
          kind,
          title,
          surface,
          ending,
          rowFurigana
        }))
      )
      for (const [index, row] of data.rows[mode].entries()) {
        const form = readConjugatedForm(renderToStaticMarkup(<ConjugatedFormContent row={row} />))
        const recorded = forms[index]
        expect(form).toEqual({
          explanation: recorded.explanation,
          sharedSpelling: recorded.sharedSpellings
            ? sharedSpellingNote(recorded.sharedSpellings)
            : null,
          furigana: recorded.furigana,
          ending: recorded.ending
        })
      }
    }
  })
})
