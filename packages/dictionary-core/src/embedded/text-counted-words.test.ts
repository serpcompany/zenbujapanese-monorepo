import { describe, expect, test } from 'vitest'
import { interruptedSearch } from '../search/database'
import { morphemes } from '../search/morphology.fixture'
import { embeddedEndpoint } from './dictionary'
import { ask, begin, fakeHost, settled } from './fake-host'
import { entries, host, linked, sentences } from './text-fixture'

const counted = (target: ReturnType<typeof host>, lines: readonly string[]) =>
  ask(target, 'countedWords', JSON.stringify(lines)) as Promise<string[]>

describe('the embedded text engine’s count of the words a learner can know', () => {
  test('counts, across a list of lines, each word linked to one entry that is no function word', async () => {
    const lines = [
      '日本語を見た',
      '「日本語を」',
      '',
      '日本語は',
      '欠けた分析',
      '今日',
      '日本語を見た'
    ]
    expect(await counted(host(), lines)).toEqual(['a1', 'v1', 'a1', 'a1', 'k1', 'a1', 'v1'])
  })

  test('counts the words a text’s linked tokens show as one entry and no function word', async () => {
    const target = host()
    for (const text of Object.keys(sentences)) {
      const tokens = await linked(target, { text, query: '', highlightedEntry: null })
      expect(await counted(target, [text]), text).toEqual(
        tokens.flatMap(found =>
          found.entry !== null && !found.isFunctionWord ? [found.entry] : []
        )
      )
    }
  })

  test('asks the dictionary once for every line’s words when it counts, and reads no entry', async () => {
    const target = host()
    const endpoint = embeddedEndpoint(target)
    const lines = JSON.stringify(['日本語を見た', '今日', '日本語は'])
    const words = { value: ['a1', 'v1', 'k1', 'a1'] }
    expect(await settled(endpoint.begin('countedWords', lines))).toEqual(words)
    expect(target.asked).toEqual([['日本語', 'を', '見る', '今日', 'は']])
    expect(await settled(endpoint.begin('countedWords', lines))).toEqual(words)
    expect(target.asked).toHaveLength(1)
  })

  test('remembers a line it has counted, and analyzes again one it could not read', async () => {
    const tokenized: string[] = []
    const target = fakeHost(entries, {
      tokenize: text => {
        tokenized.push(text)
        if (!Object.hasOwn(sentences, text)) throw new Error(`The tokenizer has no ${text}`)
        return sentences[text]
      }
    })
    const endpoint = embeddedEndpoint(target)
    const lines = JSON.stringify(['今日', '日本語を見た', '未知', '今日'])
    const words = { value: ['k1', 'a1', 'v1', 'k1'] }
    expect(await settled(endpoint.begin('countedWords', lines))).toEqual(words)
    expect(tokenized).toEqual(['今日', '日本語を見た', '未知'])
    expect(await settled(endpoint.begin('countedWords', lines))).toEqual(words)
    expect(tokenized).toEqual(['今日', '日本語を見た', '未知', '未知'])
  })

  test('stops counting once the host says nobody wants the answer', async () => {
    let tokenized = 0
    const target = fakeHost(entries, {
      tokenize: text => {
        tokenized++
        return sentences[text]
      },
      interrupted: () => tokenized > 0
    })
    await expect(counted(target, ['日本語を見た', '今日'])).rejects.toThrow(interruptedSearch)
    expect(tokenized).toBe(1)
  })

  test('asks a host without a tokenizer for each counted line’s words in turn', async () => {
    const noun = (surface: string) => ({ words: morphemes([[surface, surface, '名詞']]) })
    const call = begin(fakeHost(entries), 'countedWords', JSON.stringify(['日本語', '今日']))
    expect(await settled(call)).toEqual({ analyze: '日本語' })
    call.analyzed(JSON.stringify(noun('日本語')))
    expect(await settled(call)).toEqual({ analyze: '今日' })
    call.analyzed(JSON.stringify(noun('今日')))
    expect(await settled(call)).toEqual({ value: ['a1', 'k1'] })
  })
})
