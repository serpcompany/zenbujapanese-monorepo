import { describe, expect, test } from 'vitest'
import type { Caption } from './lines'
import { youTubeCaptions, youTubeTranslatedCaptions, youTubeVideo } from './youtube'

const tracks = (listed: object[]) =>
  JSON.stringify({
    playabilityStatus: { status: 'OK' },
    videoDetails: { title: '猫の写真', author: 'NIJ' },
    captions: { playerCaptionsTracklistRenderer: { captionTracks: listed } }
  })

const english = { baseUrl: 'https://www.youtube.com/api/timedtext?v=a&lang=en', languageCode: 'en' }
const automatic = {
  baseUrl: 'https://www.youtube.com/api/timedtext?v=a&lang=ja&kind=asr',
  languageCode: 'ja',
  kind: 'asr',
  isTranslatable: true
}
const creatorMade = {
  baseUrl: 'https://www.youtube.com/api/timedtext?v=a&lang=ja',
  languageCode: 'ja',
  isTranslatable: true
}

const transcript = (...lines: string[]) => `<transcript>\n${lines.join('\n')}\n</transcript>`
const texts = (captions: Caption[] | null) => captions?.map(caption => caption.text)

describe('youTubeVideo (YouTubeCaptionParsing.tracks and japaneseTrack)', () => {
  test('creator-made Japanese captions are preferred over automatic ones', () => {
    expect(youTubeVideo(tracks([english, automatic, creatorMade]))).toEqual({
      playable: true,
      title: '猫の写真',
      author: 'NIJ',
      track: { url: creatorMade.baseUrl, isAutomatic: false, isTranslatable: true }
    })
    expect(youTubeVideo(tracks([english]))?.track).toBeNull()
  })

  test('automatic Japanese captions are used when they are the only Japanese track', () => {
    const video = youTubeVideo(tracks([{ ...automatic, languageCode: 'ja-JP' }, english]))
    expect(video?.track).toEqual({
      url: automatic.baseUrl,
      isAutomatic: true,
      isTranslatable: true
    })
  })

  test('an unplayable video says so, and a video with no details has no title', () => {
    const response = '{"playabilityStatus":{"status":"ERROR","reason":"This video is unavailable"}}'
    expect(youTubeVideo(response)).toEqual({
      playable: false,
      title: null,
      author: null,
      track: null
    })
  })

  test('skips a listed track without a link, and reads a missing translatable flag as false', () => {
    const video = youTubeVideo(
      tracks([{ languageCode: 'ja' }, { baseUrl: 'https://x.test/t', languageCode: 'ja' }])
    )
    expect(video?.track).toEqual({
      url: 'https://x.test/t',
      isAutomatic: false,
      isTranslatable: false
    })
  })

  test('an answer that isn’t a JSON object is unreadable', () => {
    for (const answer of ['', '<html>', '[]', 'null', '"OK"'])
      expect(youTubeVideo(answer)).toBeNull()
  })
})

describe('youTubeCaptions (YouTubeCaptionParsing.cues with the timed-text reader)', () => {
  test('timed text becomes lines with decoded text, joined rows, and no overlaps', () => {
    const captions = youTubeCaptions(
      `<?xml version="1.0" encoding="utf-8" ?>${transcript(
        '<text start="0.5" dur="4.0">これは猫の写真です。\n写真です。</text>',
        '<text start="3.0" dur="2.5">色々な猫の写真があります。</text>',
        '<text start="6" dur="1"> </text>',
        '<text start="7.25" dur="2">It&amp;#39;s &amp;quot;fine&amp;quot; &amp;amp; ok</text>'
      )}`
    )
    expect(captions).toEqual([
      { id: 0, start: 0.5, end: 3, text: 'これは猫の写真です。写真です。', translation: null },
      { id: 1, start: 3, end: 5.5, text: '色々な猫の写真があります。', translation: null },
      { id: 2, start: 7.25, end: 9.25, text: 'It\'s "fine" & ok', translation: null }
    ])
  })

  test('sound tags in automatic captions are dropped, and tag-only lines disappear', () => {
    const captions = youTubeCaptions(
      transcript(
        '<text start="11" dur="4">[音楽]</text>',
        '<text start="17" dur="3">[音楽] 私のことを</text>',
        '<text start="20" dur="3">［拍手］</text>',
        '<text start="23" dur="2">[Music] Do</text>'
      )
    )
    expect(texts(captions)).toEqual(['私のことを', 'Do'])
  })

  test('decodes the entities YouTube leaves in a line, and keeps a reference that names no character', () => {
    const captions = youTubeCaptions(
      transcript(
        '<text start="0" dur="1">&amp;lt;b&amp;gt; &amp;#x732B; &amp;#29483; &amp;apos;</text>',
        '<text start="1" dur="1">&amp;#xD800; &amp;#1F; &amp;#x110000; &amp;amp;#39; &amp;nbsp;</text>'
      )
    )
    expect(texts(captions)).toEqual(["<b> 猫 猫 '", '&#xD800; &#1F; &#x110000; &#39; &nbsp;'])
  })

  test('reads a missing or unreadable time as zero and takes text inside other elements', () => {
    const captions = youTubeCaptions(
      transcript(
        '<text dur="2"><font color="#fff">一</font></text>',
        '<text start="x" dur="1e1">二</text>'
      )
    )
    expect(captions?.map(({ start, end, text }) => [start, end, text])).toEqual([
      [0, 0, '一'],
      [0, 10, '二']
    ])
  })

  test('an answer that isn’t timed text is unreadable, and one with no lines has none', () => {
    expect(youTubeCaptions('<html><body>Our systems have detected unusual traffic')).toBeNull()
    expect(youTubeCaptions('')).toBeNull()
    expect(youTubeCaptions('<html><body>Our systems</body></html>')).toEqual([])
  })
})

describe('youTubeTranslatedCaptions (YouTubeCaptionParsing.translationSentences and pairing)', () => {
  const japanese = (rows: [number, number, string][]): Caption[] =>
    rows.map(([start, end, text], id) => ({ id, start, end, text, translation: null }))

  test('empty translated slots extend the sentence that follows them back to their start', () => {
    const lines = japanese([
      [40.76, 44.399, '突然のキス'],
      [44.399, 49.039, 'や熱いまなざしで'],
      [49.039, 53.44, '恋のプログラムを'],
      [53.44, 60.57, '狂わせないでね'],
      [64.76, 69.96, '上に置いて']
    ])
    const paired = youTubeTranslatedCaptions(
      lines,
      transcript(
        '<text start="17.21" dur="20.68">[Music] Do</text>',
        '<text start="40.76" dur="8.279"></text>',
        '<text start="44.399" dur="9.041"></text>',
        '<text start="53.44" dur="8.759">n&amp;#39;t mess with the program of love</text>',
        '<text start="60.57" dur="4.19">[Music]</text>',
        '<text start="64.76" dur="5.2">Put it on top</text>'
      )
    )
    expect(texts(paired)).toEqual(texts(lines))
    expect(paired?.map(caption => caption.translation)).toEqual([
      null,
      null,
      null,
      "Don't mess with the program of love",
      'Put it on top'
    ])
  })

  test('an unreadable translation is unreadable', () => {
    const lines = japanese([[0, 2, '三番線です']])
    expect(youTubeTranslatedCaptions(lines, '')).toBeNull()
    expect(youTubeTranslatedCaptions(lines, '<transcript></transcript>')).toEqual(lines)
  })
})
