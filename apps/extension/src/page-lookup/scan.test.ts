import { describe, expect, it, vi } from 'vitest'
import type { PopupAnswer, SegmentAnswer } from '../shared/answers'
import { notReady, popupAnswer, sentence, sentenceAnswer, sentenceTokens } from '../test/word-cards'
import { glossCache } from './glosses'
import type { Found } from './rendering'
import { covering, readText, type Segment, scanner } from './scan'
import { pageTokens } from './words'

const segmentOf =
  (answers: Record<string, SegmentAnswer>): Segment =>
  async text =>
    answers[text] ?? { type: 'segment', tokens: [{ text }], romaji: null }

const textNode = (data: string) => ({ data, isConnected: true }) as Text

describe('readText', () => {
  it('reads the text into placed tokens and keeps its romaji', async () => {
    const read = await readText(sentence, segmentOf({ [sentence]: sentenceAnswer }))
    if (read.type !== 'found') throw new Error(read.type)
    expect(read.found.tokens.map(token => [token.start, token.text])).toEqual([
      [0, '要求'],
      [2, 'が'],
      [3, '要る'],
      [5, '。']
    ])
    expect(read.found.romaji).toBe('youkyuu ga iru.')
  })

  it('answers not-ready while the dictionary isn’t, and a problem when the tokens don’t fit', async () => {
    await expect(readText(sentence, async () => notReady)).resolves.toEqual({ type: 'not-ready' })
    await expect(
      readText(sentence, segmentOf({ [sentence]: { ...sentenceAnswer, tokens: [{ text: '要' }] } }))
    ).resolves.toEqual({ type: 'problem', problem: 'segment-mismatch' })
    await expect(
      readText(sentence, async () => ({ type: 'failed', reason: 'broken' }))
    ).resolves.toEqual({ type: 'problem', problem: 'segment-failed' })
  })
})

describe('covering', () => {
  it('fills the gaps around placed tokens with plain text', () => {
    const placed = pageTokens(sentenceTokens.slice(0, 1), '要求', 3) ?? []
    expect(
      covering('Hi 要求 ok', placed).map(token => [token.start, token.text, token.ids])
    ).toEqual([
      [0, 'Hi ', []],
      [3, '要求', ['youkyuu']],
      [5, ' ok', []]
    ])
  })
})

describe('scanner', () => {
  it('waits while the dictionary isn’t ready, then reads the text it held', async () => {
    let ready = false
    let resume = () => {}
    const found = vi.fn<(node: Text, found: Found) => void>()
    const wait = vi.fn(() => new Promise<void>(go => (resume = go)))
    const scan = scanner({
      segment: async () => (ready ? sentenceAnswer : notReady),
      found,
      problem: vi.fn(),
      wait
    })
    const node = textNode(sentence)
    scan.add([node])
    await vi.waitFor(() => expect(wait).toHaveBeenCalledWith(2000))
    expect(found).not.toHaveBeenCalled()
    ready = true
    resume()
    await vi.waitFor(() => expect(found).toHaveBeenCalledTimes(1))
    expect(found.mock.calls[0][0]).toBe(node)
  })

  it('drops text that changed or left the page while it was read, and reads nothing once stopped', async () => {
    const found = vi.fn()
    const scan = scanner({
      segment: async () => sentenceAnswer,
      found,
      problem: vi.fn(),
      wait: vi.fn()
    })
    const changed = textNode(sentence)
    const gone = textNode(sentence)
    scan.add([changed, gone])
    changed.data = '要る'
    Object.assign(gone, { isConnected: false })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(found).not.toHaveBeenCalled()
    scan.stop()
    scan.add([textNode(sentence)])
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(found).not.toHaveBeenCalled()
  })
})

describe('glossCache', () => {
  it('keeps each word’s short meaning, asking once for a word however often it is wanted', async () => {
    const lookUp = vi.fn(async (id: string) => popupAnswer(id))
    const cache = glossCache(lookUp)
    await Promise.all([cache.fetch(['youkyuu', 'iru']), cache.fetch(['youkyuu'])])
    await cache.fetch(['youkyuu', 'missing'])
    expect(Object.fromEntries(cache.known)).toEqual({
      youkyuu: 'demand',
      iru: 'be needed',
      missing: null
    })
    expect(lookUp.mock.calls.map(([id]) => id)).toEqual(['youkyuu', 'iru', 'missing'])
  })

  it('asks again for a word the dictionary wasn’t ready for', async () => {
    let answer: PopupAnswer | typeof notReady = notReady
    const cache = glossCache(async () => answer)
    await cache.fetch(['iru'])
    expect(cache.known.has('iru')).toBe(false)
    answer = popupAnswer('iru')
    await cache.fetch(['iru'])
    expect(cache.known.get('iru')).toBe('be needed')
  })

  it('has at most its limit of lookups out at once', async () => {
    let out = 0
    let most = 0
    const cache = glossCache(async id => {
      out += 1
      most = Math.max(most, out)
      await new Promise(resolve => setTimeout(resolve, 1))
      out -= 1
      return popupAnswer(id)
    }, 2)
    await cache.fetch(['youkyuu', 'iru', 'kaname', 'you'])
    expect(most).toBe(2)
    expect(cache.known.size).toBe(4)
  })
})
