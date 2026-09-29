import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import {
  type ConjugationMode,
  type Conjugations,
  conjugations,
  sharedSpellingNote
} from '@/lib/dictionary/detail/conjugation'
import {
  examplesPerPage,
  formExample,
  noFormExamplesMessage
} from '@/lib/dictionary/detail/examples'
import type { ExampleSentenceRow, FormExampleRow } from '@/lib/dictionary/detail/rows'
import { rubySegments } from '@/lib/dictionary/detail/ruby'
import type {
  SuiteConjugationForm,
  SuiteConjugations,
  SuiteFormExamples
} from '@/lib/dictionary/detail/suite'
import { wordDetail } from '@/lib/dictionary/detail/word'
import { dictionaryDatabase } from '@/lib/dictionary/dictionary-db'
import { databaseLinks, pageExample, storedWordPath } from '@/lib/dictionary/page-example'
import { conjugatedFormPath, conjugationsPath } from '@/lib/dictionary/urls'
import {
  ConjugatedFormContent,
  ConjugatedFormExamples,
  ConjugationTableContent,
  type ConjugationWord
} from './conjugations'
import { readConjugatedForm, readConjugationTable, readExamples } from './rendered-word'
import { WordHeader } from './word-header'

// Renders the conjugation table's page and each form's page to HTML, as the server does, and reads
// back what a reader sees: the header's meaning and rule, the Plain/Polite control, each row's
// title, form, highlighted ending, and the form page it opens, and each form's meaning, shared
// spelling, furigana, and examples, with each example's words, links, and accented form. The first
// tests render fixed data; the last runs every word-detail.json case with a table through the
// dictionary database and the detail core into the components (ZENBU_DICTIONARY_D1=1, part of the
// dictionary import's gate).

const noReadings = new Map()
const miruPath = '/dictionary/見る-1259290/'

function table(word: ConjugationWord, data: Conjugations, mode: ConjugationMode, path = miruPath) {
  return renderToStaticMarkup(
    <ConjugationTableContent
      word={word}
      conjugations={data}
      mode={mode}
      onModeChange={() => {}}
      wordPath={path}
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
  romaji: 'miru',
  readingWithoutFurigana: 'みる',
  summary: 'to see, to look, to watch, to view, to observe',
  partOfSpeech: 'Ichidan verb (transitive)',
  pitch: null
}

describe('the conjugation table', () => {
  test('shows the word, its rule, the register control, and each form, opening its page', () => {
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
        rowFurigana: false,
        href: '/dictionary/見る-1259290/conjugations/plain/present-future/'
      },
      {
        kind: 'past',
        title: 'Past',
        surface: '見た',
        ending: 'た',
        rowFurigana: false,
        href: '/dictionary/見る-1259290/conjugations/plain/past/'
      },
      {
        kind: 'negative',
        title: 'Negative',
        surface: '見ない',
        ending: 'ない',
        rowFurigana: false,
        href: '/dictionary/見る-1259290/conjugations/plain/negative/'
      }
    ])
    const polite = readConjugationTable(table(miruWord, miru, 'Polite'))
    expect(polite.rows[0]).toMatchObject({
      surface: '見ます',
      ending: 'ます',
      href: '/dictionary/見る-1259290/conjugations/polite/present-future/'
    })
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
    const rows = readConjugationTable(
      table(miruWord, kuru, 'Plain', '/dictionary/来る-1547720/')
    ).rows
    expect(rows.find(row => row.kind === 'causative')).toEqual({
      kind: 'causative',
      title: 'Causative',
      surface: '来させる',
      ending: '来させる',
      rowFurigana: true,
      href: '/dictionary/来る-1547720/conjugations/plain/causative/'
    })
  })

  test('a form’s page says what it means, and which forms share its spelling', () => {
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

  test('a form’s examples link each word and accent the form’s words', () => {
    const sentence: ExampleSentenceRow = {
      id: 7,
      pairId: '1bead88e1efe242f0f44bce34ab169d7',
      japanese: '見たか？',
      english: 'Did you see it?',
      tokens: [
        { text: '見た', reading: 'みた', dictionaryForm: '見る' },
        { text: 'か' },
        { text: '？' }
      ],
      japaneseTatoebaId: 1,
      japaneseContributor: null,
      japaneseLicense: 'CC BY 2.0 FR',
      englishTatoebaId: 2,
      englishContributor: null,
      englishLicense: 'CC BY 2.0 FR'
    }
    const example: FormExampleRow = {
      surface: '見た',
      position: 0,
      sentenceId: 7,
      highlights: [0],
      links: [
        { token: 0, entSeqs: [1259290] },
        { token: 1, entSeqs: [2028970, 2028980] }
      ]
    }
    const links = databaseLinks(new Map([[1259290, '見る']]), new Set())
    const html = renderToStaticMarkup(
      <ConjugatedFormExamples
        examples={[pageExample(formExample({ sentence, example }), links)]}
        listed={1}
        path="/dictionary/examples/forms/%E8%A6%8B%E3%81%9F.json?build=b"
      />
    )
    expect(readExamples(html)).toEqual([
      {
        pairId: '1bead88e1efe242f0f44bce34ab169d7',
        tokens: [
          { surface: '見た', href: '/dictionary/見る-1259290/', highlighted: true },
          { surface: 'か', href: '/dictionary/search/%E3%81%8B/', highlighted: false },
          { surface: '？', href: null, highlighted: false }
        ]
      }
    ])
    const none = renderToStaticMarkup(<ConjugatedFormExamples examples={[]} listed={0} path="" />)
    expect(none).toContain(noFormExamplesMessage)
    expect(noFormExamplesMessage).toBe('No example sentences use this form yet.')
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

  test('the part-of-speech row opens the table’s page only when the word has one', () => {
    const header = (path: string | null) =>
      renderToStaticMarkup(
        <WordHeader
          ruby={miruWord.ruby}
          reading="みる"
          romaji="miru"
          readingWithoutFurigana="みる"
          pitch={null}
          partOfSpeech="Ichidan verb (transitive)"
          conjugationsPath={path}
        />
      )
    expect(header(conjugationsPath(miruPath))).toMatch(
      /<a data-opens-conjugations="true"[^>]* href="\/dictionary\/見る-1259290\/conjugations\/"/
    )
    expect(header(null)).not.toContain('data-opens-conjugations')
  })
})

const enabled = process.env.ZENBU_DICTIONARY_D1 === '1'

/** A form as the suite records it, with the examples its screen lists. */
interface SuiteForm extends SuiteConjugationForm {
  examples: SuiteFormExamples
}

interface SuiteCase {
  covers: string
  entSeq: string[]
  opensConjugations: boolean
  conjugations?: SuiteConjugations & { plain: SuiteForm[]; polite?: SuiteForm[] }
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

describe.runIf(enabled)('the rendered conjugation pages match the app', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<CloudflareEnv>>>
  let db: D1Database
  let dictionary: ReturnType<typeof dictionaryDatabase>

  beforeAll(async () => {
    proxy = await getPlatformProxy<CloudflareEnv>({
      persist: { path: `${process.env.ZENBU_DICTIONARY_D1_PATH ?? '.dictionary-d1'}/v3` }
    })
    if (!proxy.env.DICTIONARY_DB)
      throw new Error('wrangler.jsonc has no local DICTIONARY_DB binding')
    db = proxy.env.DICTIONARY_DB
    dictionary = dictionaryDatabase(db)
  })

  afterAll(async () => {
    await proxy?.dispose()
  })

  /** Each word page's path, by the Language Reference ID the suite records. */
  async function wordPaths(ids: string[]): Promise<Map<string, string>> {
    const paths = new Map<string, string>()
    for (let start = 0; start < ids.length; start += 100) {
      const batch = ids.slice(start, start + 100)
      const { results } = await db
        .prepare(`SELECT id, ent_seq, slug FROM words WHERE id IN (${batch.map(() => '?')})`)
        .bind(...batch)
        .all<{ id: string; ent_seq: number; slug: string }>()
      for (const row of results) paths.set(row.id, storedWordPath(row.slug, row.ent_seq))
    }
    return paths
  }

  test.each(suiteCases)('$covers', async expected => {
    const word = await dictionary.conjugationWord(Number(expected.entSeq[0]))
    if (!word) throw new Error(`No word ${expected.entSeq[0]}`)
    const detail = wordDetail(word.rows)
    const path = storedWordPath(word.slug, detail.entSeq)
    // The part-of-speech row opens the table's page exactly when the app's opens the table.
    const header = renderToStaticMarkup(
      <WordHeader
        ruby={detail.ruby}
        reading={detail.reading}
        romaji={detail.romaji}
        readingWithoutFurigana={detail.readingWithoutFurigana}
        pitch={detail.pitch}
        partOfSpeech={detail.partOfSpeech}
        conjugationsPath={detail.conjugations ? conjugationsPath(path) : null}
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
      romaji: detail.romaji,
      readingWithoutFurigana: detail.readingWithoutFurigana,
      summary: detail.summary,
      partOfSpeech: detail.partOfSpeech,
      pitch: detail.pitch
    }
    const registers: [ConjugationMode, SuiteForm[]][] = [
      ['Plain', suite.plain],
      ...(suite.polite ? [['Polite', suite.polite] as [ConjugationMode, SuiteForm[]]] : [])
    ]
    for (const [mode, forms] of registers) {
      const drawn = readConjugationTable(table(word_, data, mode, path))
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
          rowFurigana,
          href: conjugatedFormPath(path, mode, kind)
        }))
      )
      for (const [index, row] of data.rows[mode].entries()) {
        const recorded = forms[index]
        const form = readConjugatedForm(renderToStaticMarkup(<ConjugatedFormContent row={row} />))
        expect(form).toEqual({
          explanation: recorded.explanation,
          sharedSpelling: recorded.sharedSpellings
            ? sharedSpellingNote(recorded.sharedSpellings)
            : null,
          furigana: recorded.furigana,
          ending: recorded.ending
        })
        // The form's page draws its first examples, in the app's order, each word linked where
        // the app links it and the form's words accented.
        const found = await dictionary.formExamples(row.surface, 0, examplesPerPage)
        expect(found.listed).toBe(recorded.examples.ids.length)
        const links = databaseLinks(found.slugs, new Set())
        const html = renderToStaticMarkup(
          <ConjugatedFormExamples
            examples={found.rows.map(rows => pageExample(formExample(rows), links))}
            listed={found.listed}
            path="/dictionary/examples/forms/form.json?build=b"
          />
        )
        const examples = readExamples(html)
        expect(examples.map(example => `esp1_${example.pairId}`)).toEqual(
          recorded.examples.ids.slice(0, examplesPerPage)
        )
        if (recorded.examples.ids.length === 0) expect(html).toContain(noFormExamplesMessage)
        const paths = await wordPaths([
          ...new Set(
            recorded.examples.shown.flatMap(shown =>
              shown.tokens.flatMap(token => (token.entry ? [token.entry] : []))
            )
          )
        ])
        for (const [position, shown] of recorded.examples.shown.entries()) {
          expect(examples[position].tokens).toEqual(
            shown.tokens.map(token => ({
              surface: token.surface,
              href: token.entry
                ? (paths.get(token.entry) ?? `missing ${token.entry}`)
                : token.candidates
                  ? expect.stringMatching(/^\/dictionary\/search\/[^/]+\/$/)
                  : null,
              highlighted: token.highlighted === true
            }))
          )
        }
      }
    }
  })
})
