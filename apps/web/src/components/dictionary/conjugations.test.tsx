import {
  type ConjugationMode,
  type Conjugations,
  conjugations,
  sharedSpellingNote
} from '@zenbu/dictionary-core/detail/conjugation'
import { formExample, noFormExamplesMessage } from '@zenbu/dictionary-core/detail/examples'
import type { ExampleSentenceRow, FormExampleRow } from '@zenbu/dictionary-core/detail/rows'
import { rubySegments } from '@zenbu/dictionary-core/detail/ruby'
import type {
  SuiteConjugationForm,
  SuiteConjugations,
  SuiteFormExamples
} from '@zenbu/dictionary-core/detail/suite'
import { wordDetail } from '@zenbu/dictionary-core/detail/word'
import { exampleLimit } from '@zenbu/dictionary-core/examples/retrieval'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { pageExample, serviceLinks } from '@/lib/dictionary/page-example'
import {
  ConjugatedFormContent,
  ConjugationsSection,
  ConjugationTableContent,
  FormExampleList
} from './conjugations'
import { gateEnabled, gateService, recordedCases } from './gate'
import { readConjugatedForm, readConjugationTable, readExamples } from './rendered-word'
import { WordHeader } from './word-header'

const noReadings = new Map()

const table = (data: Conjugations) =>
  readConjugationTable(renderToStaticMarkup(<ConjugationTableContent conjugations={data} />))

const miru = conjugations(
  { headword: '見る', reading: 'みる', partsOfSpeech: ['ichidanVerb', 'transitive'] },
  noReadings
) as Conjugations

const potential = miru.rows.Plain.find(row => row.kind === 'potential')
if (!potential) throw new Error('No potential form')

describe('the conjugation table', () => {
  test('shows the rule, the register control, and both registers’ rows, Polite hidden', () => {
    const drawn = table(miru)
    expect(drawn.rule).toBe('Drop る, then add the ending.')
    expect(drawn.modes).toEqual(['Plain', 'Polite'])
    expect(Object.keys(drawn.registers)).toEqual(['Plain', 'Polite'])
    expect(drawn.registers.Plain.hidden).toBe(false)
    expect(drawn.registers.Polite.hidden).toBe(true)
    expect(drawn.registers.Plain.rows.slice(0, 3)).toEqual([
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
    expect(drawn.registers.Polite.rows[0]).toMatchObject({ surface: '見ます', ending: 'ます' })
  })

  test('an adjective has no register control, and one register', () => {
    const shizuka = conjugations(
      { headword: '静か', reading: 'しずか', partsOfSpeech: ['naAdjective'] },
      noReadings
    ) as Conjugations
    const html = renderToStaticMarkup(<ConjugationTableContent conjugations={shizuka} />)
    expect(html).not.toContain('data-conjugation-mode')
    const drawn = readConjugationTable(html)
    expect(Object.keys(drawn.registers)).toEqual(['Plain'])
    expect(drawn.registers.Plain.rows.map(row => row.surface)).toEqual([
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
    expect(table(kuru).registers.Plain.rows.find(row => row.kind === 'causative')).toEqual({
      kind: 'causative',
      title: 'Causative',
      surface: '来させる',
      ending: '来させる',
      rowFurigana: true
    })
  })

  test('each form is a closed row, named for its form, holding what the form means', () => {
    const html = renderToStaticMarkup(<ConjugationTableContent conjugations={miru} />)
    const past = html.match(/data-conjugation-row="past"><button([^>]*)>/)?.[1] ?? ''
    expect(past).toContain('aria-expanded="false"')
    expect(past).toContain('aria-label="Past, 見た, みた"')
    const panel = past.match(/aria-controls="([^"]+)"/)?.[1]
    expect(html).toContain(`<div id="${panel}" hidden=""><div`)
    expect(table(miru).registers.Plain.forms[1].explanation).toBe(miru.rows.Plain[1].explanation)
    expect(html).not.toContain('data-conjugation-examples')
  })

  test('a form says what it means, and which forms share its spelling', () => {
    const form = readConjugatedForm(renderToStaticMarkup(<ConjugatedFormContent row={potential} />))
    expect(form).toEqual({
      explanation:
        'Expresses ability or possibility: that someone can do the action or that the action is possible.',
      sharedSpelling: 'Same spelling as Passive. Context tells them apart.',
      furigana: [{ base: '見', reading: 'み' }, { base: 'られる' }],
      ending: 'られる'
    })
    const index = miru.rows.Plain.indexOf(potential)
    expect(table(miru).registers.Plain.forms[index]).toEqual(form)
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
    const links = serviceLinks({ 1259290: '見る' }, [])
    const html = renderToStaticMarkup(
      <FormExampleList examples={[pageExample(formExample({ sentence, example }), links)]} />
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
    expect(html).not.toContain('Load more examples')
    const none = renderToStaticMarkup(<FormExampleList examples={[]} />)
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
})

describe('the Conjugations section', () => {
  test('starts closed, at #conjugations, with the table inside', () => {
    const html = renderToStaticMarkup(<ConjugationsSection conjugations={miru} />)
    expect(html).toMatch(/^<div[^>]* id="conjugations"/)
    expect(html).toMatch(/<h2[^>]*><button type="button" aria-expanded="false"[^>]*>Conjugations/)
    const panel = html.match(/aria-controls="([^"]+)"/)?.[1]
    expect(html).toContain(`<div id="${panel}" hidden="" class="pt-4"><div`)
    expect(html).toContain('data-conjugation-table="true"')
  })

  test('the part-of-speech row links to it only when the word has a table', () => {
    const header = (data: Conjugations | null) =>
      renderToStaticMarkup(
        <WordHeader
          ruby={rubySegments('見る', 'みる')}
          reading="みる"
          pitch={null}
          partOfSpeech="Ichidan verb (transitive)"
          conjugations={data}
        />
      )
    expect(header(miru)).toMatch(/<a href="#conjugations" data-opens-conjugations="true"/)
    expect(header(miru)).toContain('Ichidan verb (transitive)')
    expect(header(null)).not.toContain('data-opens-conjugations')
    expect(header(null)).toContain('<p class="text-sm">Ichidan verb (transitive)</p>')
  })
})

interface SuiteForm extends SuiteConjugationForm {
  examples: SuiteFormExamples
}

interface SuiteCase {
  covers: string
  entSeq: string[]
  opensConjugations: boolean
  conjugations?: SuiteConjugations & { plain: SuiteForm[]; polite?: SuiteForm[] }
}

const suiteCases = recordedCases<SuiteCase>('word-detail.json')

describe.runIf(gateEnabled)('the rendered Conjugations section matches the app', () => {
  test.each(suiteCases)('$covers', async expected => {
    const service = gateService()
    const entSeq = Number(expected.entSeq[0])
    const page = await service.word(entSeq)
    if (!page) throw new Error(`No word ${entSeq}`)
    const detail = wordDetail(page.data.rows)
    const header = renderToStaticMarkup(
      <WordHeader
        ruby={detail.ruby}
        reading={detail.reading}
        pitch={detail.pitch}
        partOfSpeech={detail.partOfSpeech}
        conjugations={detail.conjugations}
      />
    )
    expect(header.includes('data-opens-conjugations')).toBe(expected.opensConjugations)
    const suite = expected.conjugations
    expect(detail.conjugations !== null).toBe(suite !== undefined)
    if (!suite || !detail.conjugations) return
    const data = detail.conjugations
    const drawn = table(data)
    expect({ rule: drawn.rule, modes: drawn.modes }).toEqual({
      rule: suite.rule,
      modes: suite.modes
    })
    const registers: [ConjugationMode, SuiteForm[]][] = [
      ['Plain', suite.plain],
      ...(suite.polite ? [['Polite', suite.polite] as [ConjugationMode, SuiteForm[]]] : [])
    ]
    expect(Object.keys(drawn.registers)).toEqual(registers.map(([mode]) => mode))
    for (const [mode, forms] of registers) {
      const register = drawn.registers[mode]
      expect(register.hidden).toBe(mode !== 'Plain')
      expect(register.rows).toEqual(
        forms.map(({ kind, title, surface, ending, rowFurigana }) => ({
          kind,
          title,
          surface,
          ending,
          rowFurigana
        }))
      )
      expect(register.forms).toEqual(
        forms.map(recorded => ({
          explanation: recorded.explanation,
          sharedSpelling: recorded.sharedSpellings
            ? sharedSpellingNote(recorded.sharedSpellings)
            : null,
          furigana: recorded.furigana,
          ending: recorded.ending
        }))
      )
      for (const [index, row] of data.rows[mode].entries()) {
        const recorded = forms[index]
        const { data: found } = await service.formExamples(row.surface, 0, exampleLimit)
        expect(found.listed).toBe(recorded.examples.ids.length)
        const links = serviceLinks(found.slugs, [])
        const html = renderToStaticMarkup(
          <FormExampleList
            examples={found.rows.map(rows => pageExample(formExample(rows), links))}
          />
        )
        const examples = readExamples(html)
        expect(examples.map(example => `esp1_${example.pairId}`)).toEqual(
          recorded.examples.ids.slice(0, exampleLimit)
        )
        if (recorded.examples.ids.length === 0) expect(html).toContain(noFormExamplesMessage)
        for (const [position, shown] of recorded.examples.shown.entries()) {
          expect(examples[position].tokens).toEqual(
            shown.tokens.map(token => ({
              surface: token.surface,
              href: token.entry
                ? expect.stringMatching(/^\/dictionary\/[^/]+-\d+\/$/)
                : token.candidates
                  ? expect.stringMatching(/^\/dictionary\/search\/[^/]+\/$/)
                  : null,
              highlighted: token.highlighted === true
            }))
          )
        }
      }
    }
  }, 30_000)
})
