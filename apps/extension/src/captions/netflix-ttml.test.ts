import { describe, expect, it } from 'vitest'
import english from './fixtures/netflix-english.xml?raw'
import japanese from './fixtures/netflix-japanese.xml?raw'
import { ttmlLines } from './netflix-ttml'

const tt = (body: string, tickRate = '') =>
  `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ${tickRate}><body><div>${body}</div></body></tt>`

describe('ttmlLines', () => {
  it("gives the saved Japanese track's lines in seconds, without ruby readings", () => {
    expect(ttmlLines(japanese)).toEqual([
      { start: 1.2, end: 3.1, text: '（鳥の声）' },
      { start: 3.5, end: 5.25, text: '今日は\nいい天気ですね' },
      { start: 5.5, end: 8.25, text: '散歩に行きましょう' },
      { start: 9, end: 11, text: '海へ' },
      { start: 11, end: 12.5, text: '部屋に入る' }
    ])
  })

  it("gives the saved English track's lines", () => {
    expect(ttmlLines(english)?.map(line => line.text)).toEqual([
      '[birds chirping]',
      "The weather's nice\ntoday.",
      "Let's go for a walk.",
      'To the sea.',
      'Into the room.'
    ])
  })

  it('reads hours, minutes, milliseconds and ticks, and collapses the source layout', () => {
    const lines = ttmlLines(
      tt(
        `<p begin="0.5h" end="1801s">一</p><p begin="1m" end="61500ms">二\n   三</p><p begin="20t" end="30t">四</p>`,
        'ttp:tickRate="10"'
      )
    )
    expect(lines).toEqual([
      { start: 1800, end: 1801, text: '一' },
      { start: 60, end: 61.5, text: '二 三' },
      { start: 2, end: 3, text: '四' }
    ])
  })

  it('leaves out a line with a time it cannot read, and reads nothing from a file that is not TTML', () => {
    expect(ttmlLines(tt('<p begin="soon" end="1s">一</p><p begin="1s" end="2s">二</p>'))).toEqual([
      { start: 1, end: 2, text: '二' }
    ])
    expect(ttmlLines('<transcript><text start="1">一</text></transcript>')).toBeNull()
    expect(ttmlLines('<tt><p>')).toBeNull()
  })
})
