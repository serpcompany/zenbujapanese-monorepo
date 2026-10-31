import { ask } from '@zenbu/dictionary-core/embedded/fake-host'
import { host } from '@zenbu/dictionary-core/embedded/text-fixture'
import { describe, expect, it, vi } from 'vitest'
import '../test/act-environment'
import type { SavingRefusal } from '../shared/account-copy'
import type { CountedWordsAnswer } from '../shared/dictionary'
import { shareStandIn } from '../test/share-stand-in'
import {
  type KnownShare,
  knownShare,
  linesPerCount,
  type Share,
  type ShareServices
} from './known-share'
import { knownWords } from './word-marks'

const captions = ['日本語を見た', '今日', '日本語は']

const countedByCore = async (lines: readonly string[]) =>
  (await ask(host(), 'countedWords', JSON.stringify(lines))) as string[]

function watched(
  texts: readonly string[],
  refusal: SavingRefusal | null = null,
  counted: Record<string, string[]> = {}
) {
  const stand = shareStandIn(counted, refusal)
  const wait = vi.fn<ShareServices['wait']>(async () => undefined)
  const services: ShareServices = { ...stand.services, wait }
  const known = knownWords(services)
  const shares: Share[] = []
  let share: KnownShare | undefined
  return {
    stand,
    services,
    wait,
    shares,
    start() {
      const started = knownShare(
        texts.map(text => ({ text })),
        services,
        known
      )
      started.subscribe(() => shares.push(started.share()))
      share = started
      return started
    },
    share: () => share?.share()
  }
}

const countingWithCore = (video: ReturnType<typeof watched>) => {
  const target = host()
  video.stand.services.countWords.mockImplementation(async lines => ({
    type: 'counted-words',
    ids: (await ask(target, 'countedWords', JSON.stringify(lines))) as string[]
  }))
}

const settle = () => new Promise(done => setTimeout(done))

describe('the share of a video’s words known', () => {
  it('reads Counting known words first, then the share of the core’s counted words known', async () => {
    const video = watched(captions)
    countingWithCore(video)
    await video.stand.knows({ k1: true })
    video.start()
    await vi.waitFor(() => expect(typeof video.share()).toBe('object'))
    const counted = await countedByCore(captions)
    expect(counted).toEqual(['a1', 'v1', 'k1', 'a1'])
    expect(video.shares).toEqual([
      'counting',
      { known: counted.filter(id => id === 'k1').length, total: counted.length }
    ])
  })

  it('rises when one of its words is marked Known, and falls when it is not, with no new count', async () => {
    const video = watched(captions)
    countingWithCore(video)
    video.start()
    await vi.waitFor(() => expect(video.share()).toEqual({ known: 0, total: 4 }))
    await video.stand.knows({ a1: true })
    expect(video.share()).toEqual({ known: 2, total: 4 })
    await video.stand.knows({ v1: true })
    expect(video.share()).toEqual({ known: 3, total: 4 })
    await video.stand.knows({ a1: false })
    expect(video.share()).toEqual({ known: 1, total: 4 })
    expect(video.stand.services.countWords).toHaveBeenCalledOnce()
  })

  it('is hidden signed out, counts once saving is allowed, and hides again when it is not', async () => {
    const video = watched(captions, 'signed-out')
    countingWithCore(video)
    video.start()
    await settle()
    expect(video.share()).toBe('hidden')
    expect(video.stand.services.countWords).not.toHaveBeenCalled()
    await video.stand.refuse(null)
    await vi.waitFor(() => expect(video.share()).toEqual({ known: 0, total: 4 }))
    await video.stand.refuse('subscription-required')
    expect(video.share()).toBe('hidden')
    await video.stand.refuse(null)
    expect(video.share()).toEqual({ known: 0, total: 4 })
    expect(video.stand.services.countWords).toHaveBeenCalledOnce()
  })

  it('counts twenty lines at a time, and stops a count still running when the video is left', async () => {
    const lines = Array.from({ length: 45 }, (_, at) => `第${at}行`)
    const counted = Object.fromEntries(lines.map(line => [line, [line]]))
    const whole = watched(lines, null, counted)
    whole.start()
    await vi.waitFor(() => expect(whole.share()).toEqual({ known: 0, total: 45 }))
    const sizes = whole.stand.services.countWords.mock.calls.map(([asked]) => asked.length)
    expect(sizes).toEqual([linesPerCount, linesPerCount, 5])

    const left = watched(lines, null, counted)
    const share = left.start()
    left.stand.services.countWords.mockImplementationOnce(async asked => {
      share.stop()
      return { type: 'counted-words', ids: asked }
    })
    await settle()
    await settle()
    expect(left.stand.services.countWords).toHaveBeenCalledOnce()
    expect(left.stand.services.knownWords).not.toHaveBeenCalled()
    expect(left.share()).toBe('counting')
  })

  it('waits and asks again while the dictionary is not ready, and hides when the count fails', async () => {
    const notReady = {
      type: 'not-ready',
      data: { state: 'downloading', done: 1, total: 2 }
    } as const
    const ready: CountedWordsAnswer = { type: 'counted-words', ids: ['a1', 'k1'] }
    const video = watched(captions)
    video.stand.services.countWords
      .mockResolvedValueOnce(notReady)
      .mockResolvedValueOnce(notReady)
      .mockResolvedValueOnce(ready)
    video.start()
    await vi.waitFor(() => expect(video.share()).toEqual({ known: 0, total: 2 }))
    expect(video.wait.mock.calls).toEqual([[2000], [4000]])

    const failing = watched(captions)
    failing.stand.services.countWords.mockResolvedValueOnce({ type: 'failed', reason: 'Broken.' })
    failing.start()
    await vi.waitFor(() => expect(failing.shares).toEqual(['counting', 'hidden']))
  })

  it('shows no share while a Known lookup has failed, and the right one once a retry answers', async () => {
    const retried = watched(captions)
    countingWithCore(retried)
    await retried.stand.knows({ k1: true })
    retried.stand.services.knownWords.mockRejectedValueOnce(new Error('No answer'))
    retried.start()
    await vi.waitFor(() => expect(typeof retried.share()).toBe('object'))
    expect(retried.shares).toEqual(['counting', { known: 1, total: 4 }])
    expect(retried.stand.services.knownWords).toHaveBeenCalledTimes(2)

    const failed = watched(captions)
    countingWithCore(failed)
    await failed.stand.knows({ k1: true })
    failed.stand.services.knownWords.mockRejectedValue(new Error('No answer'))
    failed.start()
    await vi.waitFor(() => expect(failed.share()).toBe('incomplete'))
    await settle()
    expect(failed.shares).toEqual(['counting', 'incomplete'])
    expect(failed.stand.services.knownWords).toHaveBeenCalledTimes(2)
    failed.stand.services.knownWords.mockImplementation(async items =>
      Object.fromEntries(items.map(item => [item, item === 'k1' || item === 'v1']))
    )
    await failed.stand.knows({ v1: true })
    await vi.waitFor(() => expect(typeof failed.share()).toBe('object'))
    expect(failed.share()).toEqual({ known: 2, total: 4 })
    expect(failed.shares.filter(share => typeof share === 'object')).toEqual([
      { known: 2, total: 4 }
    ])
  })

  it('reads Counting known words while the captions hold no word to count', async () => {
    const video = watched(captions)
    video.start()
    await settle()
    await settle()
    expect(video.share()).toBe('counting')
    expect(video.stand.services.countWords).toHaveBeenCalledOnce()
  })
})
