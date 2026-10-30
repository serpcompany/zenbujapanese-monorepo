import { describe, expect, test } from 'vitest'
import { japaneseCaptions, type TimedLine } from './lines'
import { netflixCaptions } from './netflix'
import { youTubeCaptions } from './youtube'

const line = (start: number, end: number, text: string): TimedLine => ({ start, end, text })

describe('netflixCaptions', () => {
  test('a sound in full-width parentheses is dropped from a Netflix line', () => {
    const captions = netflixCaptions(
      [
        line(1, 3, '（鳥の声）'),
        line(3, 5, '（男性）おはよう\n（笑い）ございます'),
        line(5, 6, 'では （笑） また')
      ],
      null
    )
    expect(captions.map(caption => caption.text)).toEqual(['おはようございます', 'では また'])
    expect(captions[0]).toMatchObject({ id: 0, start: 3, end: 5, translation: null })
  })

  test('the same parentheses stay on a YouTube line', () => {
    const timedText = '<transcript><text start="1" dur="2">（鳥の声）</text></transcript>'
    expect(youTubeCaptions(timedText)).toMatchObject([{ text: '（鳥の声）' }])
    expect(japaneseCaptions([line(1, 2, '漢字（かんじ）')])[0]?.text).toBe('漢字（かんじ）')
  })

  test('the English track is paired with the Japanese lines', () => {
    const captions = netflixCaptions(
      [line(1, 3, 'おはよう'), line(3, 5, '［音楽］'), line(5, 7, '行こう')],
      [line(1, 3, 'Good morning.'), line(5, 7, "Let's go.")]
    )
    expect(captions.map(({ text, translation }) => [text, translation])).toEqual([
      ['おはよう', 'Good morning.'],
      ['行こう', "Let's go."]
    ])
  })
})
