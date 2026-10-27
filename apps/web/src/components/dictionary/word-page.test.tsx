import { wordExample } from '@zenbu/dictionary-core/detail/examples'
import { frequencyRowDetails } from '@zenbu/dictionary-core/detail/frequency'
import { pitchAccent } from '@zenbu/dictionary-core/detail/pitch'
import { rubySegments } from '@zenbu/dictionary-core/detail/ruby'
import { pronounceLabel } from '@zenbu/dictionary-core/detail/sections'
import {
  type SuiteFrequencyDetails,
  type SuiteFurigana,
  type SuitePitchGraph,
  suiteFrequencyDetails
} from '@zenbu/dictionary-core/detail/suite'
import { wordDetail } from '@zenbu/dictionary-core/detail/word'
import { FrequencyDetailsContent, FrequencySection } from '@zenbu/ui/dictionary/frequency-section'
import { WordHeader } from '@zenbu/ui/dictionary/word-header'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { SiteExampleList, SiteMeaningExample } from '@/components/dictionary/site-examples'
import { type WordHeaderData, wordHeaderIn } from '@/components/dictionary/word-page-props'
import { pageExample, serviceLinks } from '@/lib/dictionary/page-example'
import { exampleListText, frequencyRowsIn } from '@/lib/dictionary/screen-text'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { gateEnabled, gateService, recordedCases } from '@/test/gate'
import { htmlText } from '@/test/rendered'
import {
  readExamples,
  readFrequencyDetails,
  readFrequencyRows,
  readFurigana,
  readMeaningExamples,
  readPitchGraph
} from '@/test/rendered-word'

const unidic = 'UniDic for Contemporary Written Japanese 3.1.0'

type HeaderInput = Omit<WordHeaderData, 'conjugations' | 'headword' | 'pronounce'> &
  Partial<WordHeaderData> & { locale?: Locale }

function header({ locale = 'en', ...props }: HeaderInput) {
  const word = {
    headword: props.ruby.map(segment => segment.text).join(''),
    conjugations: null,
    pronounce: pronounceLabel(props.reading),
    ...props
  }
  return renderToStaticMarkup(<WordHeader {...wordHeaderIn(word, locale)} />)
}

describe('the word header', () => {
  test('is the page heading, named for the headword whatever its furigana', () => {
    const html = header({
      headword: '学校',
      ruby: [{ text: '学校', reading: 'がっこう', kanjiReadings: ['がっ', 'こう'] }],
      reading: 'がっこう',
      pitch: null,
      partOfSpeechRow: 'Noun'
    })
    const headings = [...html.matchAll(/<h1([^>]*)>([\s\S]*?)<\/h1>/g)]
    expect(headings).toHaveLength(1)
    const [, attributes, content] = headings[0]
    expect(attributes).toContain('aria-label="学校"')
    expect(htmlText(content, { furigana: true })).toBe('学校')
    expect(content).toContain('data-reading="がっ"')
    expect(content).toContain('data-reading="こう"')
    expect(readFurigana(html)).toEqual([
      { base: '学校', reading: 'がっこう', kanjiReadings: ['がっ', 'こう'] }
    ])
  })

  test('makes each kanji of a split run a toggle over its own part of the furigana', () => {
    const html = header({
      ruby: [{ text: '学校', reading: 'がっこう', kanjiReadings: ['がっ', 'こう'] }],
      reading: 'がっこう',
      pitch: null,
      partOfSpeechRow: 'Noun'
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
          partOfSpeechRow: ''
        })
      )
    ).toEqual([{ base: '要', reading: 'い' }, { base: 'る' }])
    const whole = header({
      ruby: rubySegments('大人', 'おとな'),
      reading: 'おとな',
      pitch: null,
      partOfSpeechRow: ''
    })
    expect(readFurigana(whole)).toEqual([{ base: '大人', reading: 'おとな' }])
    expect(whole).not.toContain('<button aria-pressed')
  })

  test('draws the pitch as dots joined by a line, with a hollow dot for the particle', () => {
    const html = header({
      ruby: rubySegments('今日', 'きょう'),
      reading: 'きょう',
      pitch: pitchAccent('きょう', { downstep: 1, moraCount: 2, sourceIdentity: unidic }),
      partOfSpeechRow: 'Noun'
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
      partOfSpeechRow: 'Noun'
    })
    expect(counted).toContain('downstep 1, 3 mora')
    expect(readPitchGraph(counted)?.morae).toEqual(['キョ', 'ウ'])
  })

  test('shows a standalone speaker for a word without pitch', () => {
    const html = header({
      ruby: [{ text: 'いる' }],
      reading: 'いる',
      pitch: null,
      partOfSpeechRow: ''
    })
    expect(readPitchGraph(html)).toBeNull()
    expect(html).toContain('aria-label="Pronounce いる"')
  })

  test('on a Japanese page, names the pronunciation, the pitch, and the part of speech in Japanese', () => {
    const html = header({
      ruby: rubySegments('今日', 'きょう'),
      reading: 'きょう',
      pitch: pitchAccent('きょう', { downstep: 1, moraCount: 2, sourceIdentity: unidic }),
      partOfSpeechRow: 'Noun',
      locale: 'ja'
    })
    expect(html).toContain('きょうの発音を聞く。アクセント：1型、2拍')
    expect(html).toContain('<p class="text-sm">名詞</p>')
  })
})

const english = getDictionary('en').frequency

const shownRows = (rows: Parameters<typeof frequencyRowsIn>[0]) => frequencyRowsIn(rows, 'en')

describe('the Frequency section', () => {
  test('lists each dictionary as a row that opens its details', () => {
    const rows = frequencyRowDetails([
      { pack: 'jlpt', level: 5 },
      { pack: 'tubelex', rank: 949 }
    ])
    const html = renderToStaticMarkup(<FrequencySection rows={shownRows(rows)} text={english} />)
    expect(readFrequencyRows(html)).toEqual([
      { name: 'JLPT', text: 'N5' },
      { name: 'YouTube', text: '949' }
    ])
    expect(html.match(/<button type="button" aria-haspopup="dialog"/g)).toHaveLength(2)
  })

  test('details show the dictionary, then the rank and percentile, or why there is none', () => {
    const core = frequencyRowDetails([{ pack: 'tubelex', rank: 949 }])
    const [jlpt, youtube] = shownRows(core)
    const ranked = readFrequencyDetails(
      renderToStaticMarkup(<FrequencyDetailsContent details={youtube.details} text={english} />)
    )
    expect(ranked).toEqual(suiteFrequencyDetails(core[1].details))
    expect(ranked.rows).toEqual([
      { label: 'Rank', value: '#949' },
      { label: 'Percentile', value: 'Top 0.27%' }
    ])
    const missing = readFrequencyDetails(
      renderToStaticMarkup(<FrequencyDetailsContent details={jlpt.details} text={english} />)
    )
    expect(missing.section).toBe('Frequency')
    expect(missing.rows).toEqual([])
    expect(missing.explanation).toMatch(/^JLPT Levels does not list this entry\./)
  })

  test('on a Japanese page, reads in Japanese while keeping each row named for its dictionary', () => {
    const [, youtube] = frequencyRowsIn(frequencyRowDetails([{ pack: 'tubelex', rank: 949 }]), 'ja')
    const html = renderToStaticMarkup(
      <FrequencySection rows={[youtube]} text={getDictionary('ja').frequency} />
    )
    expect(html).toContain('data-frequency-row="YouTube"')
    expect(html).toContain('aria-label="YouTubeの頻度順位：949位、とてもよく使われる"')
    const details = renderToStaticMarkup(
      <FrequencyDetailsContent details={youtube.details} text={getDictionary('ja').frequency} />
    )
    expect(details).toContain(
      'data-details-section="Frequency"><h3 class="font-medium">使用頻度</h3>'
    )
    expect(details).toContain('<dd class="tabular-nums">949位</dd>')
    expect(details).toContain('<dd class="tabular-nums">上位0.27%</dd>')
  })
})

interface SuiteExample {
  id: string
  tokens: { surface: string; pageWord?: boolean }[]
}

interface SuiteCase {
  covers: string
  entSeq: string[]
  senses: { glosses: string[]; example?: SuiteExample }[]
  furigana: SuiteFurigana[]
  pitch?: { graph: SuitePitchGraph }
  frequency: { name: string; text: string; details: SuiteFrequencyDetails }[]
  examples: { shown: SuiteExample[] }
}

const recordedWords = (examples: readonly SuiteExample[]) =>
  examples.map(shown => shown.tokens.map(token => [token.surface, token.pageWord === true]))

const drawnWords = (examples: readonly { tokens: { surface: string; highlighted: boolean }[] }[]) =>
  examples.map(example => example.tokens.map(token => [token.surface, token.highlighted]))

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
      partOfSpeechRow: detail.partOfSpeechRow
    })
    expect(readFurigana(html)).toEqual(expected.furigana)
    expect(readPitchGraph(html)).toEqual(expected.pitch?.graph ?? null)
    expect(
      detail.senses.map(sense => sense.meaning),
      'each meaning is its recorded glosses, joined as JMdict joins them'
    ).toEqual(expected.senses.map(sense => sense.glosses.join(', ')))
    const section = renderToStaticMarkup(
      <FrequencySection rows={shownRows(detail.frequencyRows)} text={english} />
    )
    expect(readFrequencyRows(section)).toEqual(
      expected.frequency.map(({ name, text }) => ({ name, text }))
    )
    expect(
      shownRows(detail.frequencyRows).map(row =>
        readFrequencyDetails(
          renderToStaticMarkup(<FrequencyDetailsContent details={row.details} text={english} />)
        )
      )
    ).toEqual(expected.frequency.map(row => row.details))
    const links = serviceLinks(word.data.slugs, word.data.kanjiPages)
    const examples = word.data.rows.examples.map(rows => pageExample(wordExample(rows), links))
    const drawn = readExamples(
      renderToStaticMarkup(
        <SiteExampleList
          initial={examples}
          listed={examples.length}
          path={null}
          locale="en"
          text={exampleListText('en')}
        />
      )
    )
    expect(drawn.map(example => `esp1_${example.pairId}`)).toEqual(
      expected.examples.shown.map(shown => shown.id)
    )
    expect(drawnWords(drawn)).toEqual(recordedWords(expected.examples.shown))
    const meanings = readMeaningExamples(
      renderToStaticMarkup(
        detail.senses.map(sense =>
          sense.example ? (
            <SiteMeaningExample
              key={sense.number}
              example={pageExample(sense.example, links)}
              meaning={sense.number}
              locale="en"
              text={exampleListText('en')}
            />
          ) : null
        )
      )
    )
    const recorded = expected.senses.flatMap((sense, index) =>
      sense.example ? [{ meaning: index + 1, example: sense.example }] : []
    )
    expect(meanings.map(({ meaning, pairId }) => [meaning, `esp1_${pairId}`])).toEqual(
      recorded.map(({ meaning, example }) => [meaning, example.id])
    )
    expect(drawnWords(meanings)).toEqual(recordedWords(recorded.map(({ example }) => example)))
  })
})
