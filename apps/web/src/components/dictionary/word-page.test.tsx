import { frequencyRowDetails } from '@zenbu/dictionary-core/detail/frequency'
import { pitchAccent } from '@zenbu/dictionary-core/detail/pitch'
import { rubySegments } from '@zenbu/dictionary-core/detail/ruby'
import {
  type SuiteFrequencyDetails,
  type SuiteFurigana,
  type SuitePitchGraph,
  suiteFrequencyDetails
} from '@zenbu/dictionary-core/detail/suite'
import { wordDetail } from '@zenbu/dictionary-core/detail/word'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { FrequencyDetailsContent, FrequencySection } from './frequency-section'
import { gateEnabled, gateService, recordedCases } from './gate'
import {
  readFrequencyDetails,
  readFrequencyRows,
  readFurigana,
  readPitchGraph
} from './rendered-word'
import { WordHeader } from './word-header'

const unidic = 'UniDic for Contemporary Written Japanese 3.1.0'

type HeaderProps = Parameters<typeof WordHeader>[0]

function header(
  props: Omit<HeaderProps, 'summary' | 'conjugations' | 'path'> & Partial<HeaderProps>
) {
  return renderToStaticMarkup(
    <WordHeader summary="" conjugations={null} path="/dictionary/w-1/" {...props} />
  )
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
    expect(html).toContain('aria-pressed="false" aria-label="学, がっ"')
    expect(html).toContain('aria-pressed="false" aria-label="校, こう"')
    expect(html).not.toContain('aria-pressed="true"')
  })

  test('keeps a single kanji and a word read as a whole as plain furigana', () => {
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
    expect(html).toContain('Pronounce きょう. Pitch accent, downstep 1, 2 mora')
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

interface SuiteCase {
  covers: string
  entSeq: string[]
  furigana: SuiteFurigana[]
  pitch?: { graph: SuitePitchGraph }
  frequency: { name: string; text: string; details: SuiteFrequencyDetails }[]
}

const suiteCases = recordedCases<SuiteCase>('word-detail.json')

describe.runIf(gateEnabled)('the rendered word page matches the app', () => {
  test.each(suiteCases)('$covers', async expected => {
    const word = await gateService().word(Number(expected.entSeq[0]))
    if (!word) throw new Error(`No word ${expected.entSeq[0]}`)
    const detail = wordDetail(word.data.rows)
    const html = header({
      ruby: detail.ruby,
      reading: detail.reading,
      pitch: detail.pitch,
      partOfSpeech: detail.partOfSpeech
    })
    expect(readFurigana(html)).toEqual(expected.furigana)
    expect(readPitchGraph(html)).toEqual(expected.pitch?.graph ?? null)
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
