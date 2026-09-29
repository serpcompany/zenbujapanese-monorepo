import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { frequencyRowDetails } from '@/lib/dictionary/detail/frequency'
import { pitchAccent } from '@/lib/dictionary/detail/pitch'
import { rubySegments } from '@/lib/dictionary/detail/ruby'
import {
  type SuiteFrequencyDetails,
  type SuiteFurigana,
  type SuitePitchGraph,
  suiteFrequencyDetails
} from '@/lib/dictionary/detail/suite'
import { wordDetail } from '@/lib/dictionary/detail/word'
import { dictionaryDatabase } from '@/lib/dictionary/dictionary-db'
import { FrequencyDetailsContent, FrequencySection } from './frequency-section'
import {
  readFrequencyDetails,
  readFrequencyRows,
  readFurigana,
  readPitchGraph
} from './rendered-word'
import { WordHeader } from './word-header'

// Renders the word page's header card and Frequency section to HTML, as the server does, and
// reads back what a reader sees: the headword's furigana and which kanji highlight which part of
// it, the pitch graph's dots, and each Frequency row's details. The first tests render fixed data;
// the last runs every case of the app-recorded word-detail.json suite through the dictionary
// database and the detail core into the components (ZENBU_DICTIONARY_D1=1, part of the
// dictionary import's gate).

const unidic = 'UniDic for Contemporary Written Japanese 3.1.0'

type HeaderProps = Parameters<typeof WordHeader>[0]

function header(props: Omit<HeaderProps, 'conjugationsPath'> & Partial<HeaderProps>) {
  return renderToStaticMarkup(<WordHeader conjugationsPath={null} {...props} />)
}

describe('the word header', () => {
  test('makes each kanji of a split run a toggle over its own part of the furigana', () => {
    const html = header({
      ruby: [{ text: '学校', reading: 'がっこう', kanjiReadings: ['がっ', 'こう'] }],
      reading: 'がっこう',
      pitch: null,
      partOfSpeech: 'Noun'
    })
    expect(readFurigana(html)).toEqual([
      { base: '学校', reading: 'がっこう', kanjiReadings: ['がっ', 'こう'] }
    ])
    // Nothing is selected until the reader selects a kanji; each is a labeled toggle.
    expect(html).toContain('aria-pressed="false" aria-label="学, がっ"')
    expect(html).toContain('aria-pressed="false" aria-label="校, こう"')
    expect(html).not.toContain('aria-pressed="true"')
  })

  test('keeps a single kanji and a word read as a whole as plain furigana', () => {
    // 要る: 要 alone; 大人 (おとな): no split.
    expect(
      readFurigana(
        header({
          ruby: rubySegments('要る', 'いる'),
          reading: 'いる',
          pitch: null,
          partOfSpeech: ''
        })
      )
    ).toEqual([{ base: '要', reading: 'い' }, { base: 'る' }])
    const whole = header({
      ruby: rubySegments('大人', 'おとな'),
      reading: 'おとな',
      pitch: null,
      partOfSpeech: ''
    })
    expect(readFurigana(whole)).toEqual([{ base: '大人', reading: 'おとな' }])
    expect(whole).not.toContain('<button aria-pressed')
  })

  test('draws the pitch as dots joined by a line, with a hollow dot for the particle', () => {
    // 今日 (きょう), atamadaka: キョ is one and a half morae wide.
    const html = header({
      ruby: rubySegments('今日', 'きょう'),
      reading: 'きょう',
      pitch: pitchAccent('きょう', { downstep: 1, moraCount: 2, sourceIdentity: unidic }),
      partOfSpeech: 'Noun'
    })
    expect(readPitchGraph(html)).toEqual({
      morae: ['キョ', 'ウ'],
      points: [
        { x: 75, level: 'H' },
        { x: 200, level: 'L' }
      ],
      particle: { x: 280, level: 'L' }
    })
    expect(html).toContain('<polyline points="75,17.5 200,174.5 280,174.5"')
    // One button pronounces the word, and says its pitch.
    expect(html).toContain('Pronounce きょう. Pitch accent, downstep 1, 2 mora')
    // The mora count spoken is the source's, as the app's accessibility value says it, even where
    // it differs from the morae drawn.
    const counted = header({
      ruby: rubySegments('今日', 'きょう'),
      reading: 'きょう',
      pitch: pitchAccent('きょう', { downstep: 1, moraCount: 3, sourceIdentity: unidic }),
      partOfSpeech: 'Noun'
    })
    expect(counted).toContain('downstep 1, 3 mora')
    expect(readPitchGraph(counted)?.morae).toEqual(['キョ', 'ウ'])
  })

  test('shows a standalone speaker for a word without pitch', () => {
    const html = header({
      ruby: [{ text: 'いる' }],
      reading: 'いる',
      pitch: null,
      partOfSpeech: ''
    })
    expect(readPitchGraph(html)).toBeNull()
    expect(html).toContain('aria-label="Pronounce いる"')
  })
})

describe('the Frequency section', () => {
  test('lists each dictionary as a row that opens its details', () => {
    const rows = frequencyRowDetails([
      { pack: 'jlpt', level: 5 },
      { pack: 'tubelex', rank: 949 }
    ])
    const html = renderToStaticMarkup(<FrequencySection rows={rows} />)
    expect(readFrequencyRows(html)).toEqual([
      { name: 'JLPT', text: 'N5' },
      { name: 'YouTube', text: '949' }
    ])
    expect(html.match(/<button type="button" aria-haspopup="dialog"/g)).toHaveLength(2)
  })

  test('details show the dictionary, then the rank and percentile, or why there is none', () => {
    const [jlpt, youtube] = frequencyRowDetails([{ pack: 'tubelex', rank: 949 }])
    const ranked = readFrequencyDetails(
      renderToStaticMarkup(<FrequencyDetailsContent details={youtube.details} />)
    )
    expect(ranked).toEqual(suiteFrequencyDetails(youtube.details))
    expect(ranked.rows).toEqual([
      { label: 'Rank', value: '#949' },
      { label: 'Percentile', value: 'Top 0.27%' }
    ])
    const missing = readFrequencyDetails(
      renderToStaticMarkup(<FrequencyDetailsContent details={jlpt.details} />)
    )
    expect(missing.section).toBe('Frequency')
    expect(missing.rows).toEqual([])
    expect(missing.explanation).toMatch(/^JLPT Levels does not list this entry\./)
  })
})

const enabled = process.env.ZENBU_DICTIONARY_D1 === '1'

interface SuiteCase {
  covers: string
  entSeq: string[]
  furigana: SuiteFurigana[]
  pitch?: { graph: SuitePitchGraph }
  frequency: { name: string; text: string; details: SuiteFrequencyDetails }[]
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

describe.runIf(enabled)('the rendered word page matches the app', () => {
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
    const html = header({
      ruby: detail.ruby,
      reading: detail.reading,
      pitch: detail.pitch,
      partOfSpeech: detail.partOfSpeech
    })
    // The furigana as drawn, with each toggle's part of the reading.
    expect(readFurigana(html)).toEqual(expected.furigana)
    // Each dot where the app draws it, and the particle's hollow dot.
    expect(readPitchGraph(html)).toEqual(expected.pitch?.graph ?? null)
    // The rows as listed, and what each opens.
    const section = renderToStaticMarkup(<FrequencySection rows={detail.frequencyRows} />)
    expect(readFrequencyRows(section)).toEqual(
      expected.frequency.map(({ name, text }) => ({ name, text }))
    )
    expect(
      detail.frequencyRows.map(row =>
        readFrequencyDetails(
          renderToStaticMarkup(<FrequencyDetailsContent details={row.details} />)
        )
      )
    ).toEqual(expected.frequency.map(row => row.details))
  })
})
