import { describe, expect, it, vi } from 'vitest'
import { rateLimitJitter, rateLimitWaits } from './backoff'
import { captionsService } from './captions-service'
import { memoryStorage } from './fixtures/memory-storage'
import { controlledTimeouts } from './fixtures/timeouts'
import {
  englishVideo,
  japaneseLines,
  japaneseVideo,
  playerURL,
  secondJapaneseVideo,
  timedTextURL,
  youTubeStandIn
} from './fixtures/youtube-stand-in'
import { captionLabels } from './labels'
import type { CaptionsAnswer, CaptionsChange, CaptionsState } from './messages'

const startedAt = Date.UTC(2026, 9, 28, 9)

function harness({ captionsOn = true, storage = memoryStorage() } = {}) {
  const youTube = youTubeStandIn()
  const changes: CaptionsChange[] = []
  const urls = new Map<number, string>()
  const clock = { now: startedAt, random: 0.5, captionsOn, unprepared: null as Error | null }
  const service = captionsService({
    storage,
    fetch: youTube.fetch,
    prepareRequests: async () => {
      if (clock.unprepared) throw clock.unprepared
    },
    tabVideo: async tabId => urls.get(tabId) ?? null,
    captionsOn: async () => clock.captionsOn,
    announce: change => changes.push(change),
    now: () => clock.now,
    random: () => clock.random
  })
  const latest = (tabId: number): CaptionsState | undefined =>
    changes.filter(change => change.tabId === tabId).at(-1)?.captions
  return {
    youTube,
    storage,
    clock,
    service,
    latest,
    open(tabId: number, videoId: string) {
      urls.set(tabId, videoId)
      return service.answer({ type: 'video-opened', videoId }, tabId)
    },
    leave(tabId: number) {
      urls.delete(tabId)
    },
    captions: (tabId: number) => service.answer({ type: 'captions', tabId }),
    tryAgain: (tabId: number) => service.answer({ type: 'try-again', tabId }),
    async settled(tabId: number): Promise<CaptionsState | undefined> {
      await vi.waitFor(() => expect(latest(tabId)?.state).not.toBe('loading'), { interval: 1 })
      return latest(tabId)
    }
  }
}

function lines(answer: CaptionsAnswer | undefined) {
  if (!answer || !('state' in answer)) return answer
  return answer.state === 'lines' ? answer.lines.map(line => line.text) : answer.state
}

async function rateLimitedOnce() {
  const page = harness()
  page.youTube.answerTimedText(429)
  await page.open(1, japaneseVideo)
  const limited = await page.settled(1)
  if (limited?.state !== 'rate-limited') throw new Error('expected a rate limit')
  return { page, limited }
}

describe('captions service', () => {
  it("gives a video's lines, asking YouTube once for them however often they are asked for", async () => {
    const page = harness()
    expect(await page.open(1, japaneseVideo)).toEqual({ state: 'loading', videoId: japaneseVideo })
    expect(lines(await page.settled(1))).toEqual(japaneseLines)
    expect(page.youTube.timedTextRequests()).toBe(1)
    expect(lines(await page.open(1, japaneseVideo))).toEqual(japaneseLines)
    expect(lines(await page.captions(1))).toEqual(japaneseLines)
    expect(page.youTube.timedTextRequests()).toBe(1)
  })

  it('keeps the lines for the session, so a restarted service worker asks for nothing', async () => {
    const before = harness()
    await before.open(1, japaneseVideo)
    await before.settled(1)
    const after = harness({ storage: before.storage })
    expect(lines(await after.open(1, japaneseVideo))).toEqual(japaneseLines)
    expect(after.youTube.sent).toEqual([])
  })

  it('asks again for the next video in the tab, and forgets a closed tab', async () => {
    const page = harness()
    await page.open(1, japaneseVideo)
    await page.settled(1)
    await page.open(1, secondJapaneseVideo)
    expect(await page.settled(1)).toMatchObject({ state: 'lines', videoId: secondJapaneseVideo })
    expect(page.youTube.timedTextRequests()).toBe(2)
    await page.service.tabClosed(1)
    expect([...page.storage.items.keys()]).toEqual([])
  })

  it('gives No Japanese Captions for a video without a Japanese track', async () => {
    const page = harness()
    await page.open(1, englishVideo)
    expect(await page.settled(1)).toEqual({ state: 'no-japanese-captions', videoId: englishVideo })
    expect(page.youTube.timedTextRequests()).toBe(0)
  })

  it('answers no-video for a tab without a YouTube video, and a Failure for a page outside a tab', async () => {
    const page = harness()
    expect(await page.captions(4)).toEqual({ state: 'no-video' })
    expect(await page.tryAgain(4)).toEqual({ state: 'no-video' })
    expect(await page.service.answer({ type: 'video-opened', videoId: japaneseVideo })).toEqual({
      type: 'failed',
      reason: 'Only a tab opens a video.'
    })
    expect(page.youTube.sent).toEqual([])
  })

  it('with Zenbu Captions off, asks for nothing until the Video tab asks, and asks again for each next video', async () => {
    const page = harness({ captionsOn: false })
    expect(await page.open(1, japaneseVideo)).toEqual({ state: 'loading', videoId: japaneseVideo })
    await page.open(2, englishVideo)
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(page.youTube.sent).toEqual([])
    await page.captions(1)
    expect(lines(await page.settled(1))).toEqual(japaneseLines)
    expect(page.youTube.timedTextRequests()).toBe(1)
    expect(await page.open(1, secondJapaneseVideo)).toEqual({
      state: 'loading',
      videoId: secondJapaneseVideo
    })
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(page.youTube.timedTextRequests()).toBe(1)
    await page.captions(1)
    expect(await page.settled(1)).toMatchObject({ state: 'lines', videoId: secondJapaneseVideo })
    expect(page.youTube.timedTextRequests()).toBe(2)
    expect(page.latest(2)).toBeUndefined()
  })

  it('asks for the videos still open once Zenbu Captions are on, and nothing more on asking again', async () => {
    const page = harness({ captionsOn: false })
    await page.open(1, japaneseVideo)
    await page.open(2, secondJapaneseVideo)
    page.leave(2)
    page.clock.captionsOn = true
    await page.service.openVideosAgain()
    expect(lines(await page.settled(1))).toEqual(japaneseLines)
    await page.service.openVideosAgain()
    expect(page.youTube.sent.map(request => request.url)).toEqual([
      playerURL,
      timedTextURL(japaneseVideo)
    ])
    expect(page.latest(2)).toBeUndefined()
  })

  it('waits 15, 30, then 60 minutes after each rate limit, a fifth longer at most, asking nothing until then', async () => {
    for (const random of [0, 0.999]) {
      const page = harness()
      page.clock.random = random
      page.youTube.answerTimedText(429)
      await page.open(1, japaneseVideo)
      let limited = await page.settled(1)
      for (const wait of [...rateLimitWaits, rateLimitWaits.at(-1) ?? 0]) {
        if (limited?.state !== 'rate-limited')
          throw new Error(`expected a rate limit, got ${limited?.state}`)
        const delay = limited.retryAt - page.clock.now
        expect(delay).toBeGreaterThanOrEqual(wait)
        expect(delay).toBeLessThanOrEqual(wait * (1 + rateLimitJitter))
        const requests = page.youTube.sent.length
        page.clock.now = limited.retryAt - 1
        expect(await page.open(1, japaneseVideo)).toEqual(limited)
        expect(await page.captions(1)).toEqual(limited)
        expect(page.youTube.sent.length).toBe(requests)
        page.clock.now = limited.retryAt
        expect(await page.open(1, japaneseVideo)).toEqual({
          state: 'loading',
          videoId: japaneseVideo
        })
        limited = await page.settled(1)
        expect(page.youTube.timedTextRequests()).toBe(requests / 2 + 1)
      }
    }
  })

  it('keeps the wait for the session, so a restarted service worker asks nothing until it is over', async () => {
    const before = harness()
    before.youTube.answerTimedText(429)
    await before.open(1, japaneseVideo)
    const limited = await before.settled(1)
    if (limited?.state !== 'rate-limited') throw new Error('expected a rate limit')
    const after = harness({ storage: before.storage })
    after.clock.now = limited.retryAt - 1
    expect(await after.open(1, japaneseVideo)).toEqual(limited)
    expect(await after.open(2, secondJapaneseVideo)).toEqual({
      ...limited,
      videoId: secondJapaneseVideo
    })
    expect(await after.captions(1)).toEqual(limited)
    expect(after.youTube.sent).toEqual([])
  })

  it('with Zenbu Captions off, hands the watch page no wait, also one that is over', async () => {
    const { page, limited } = await rateLimitedOnce()
    page.clock.captionsOn = false
    const requests = page.youTube.sent.length
    for (const now of [limited.retryAt - 1, limited.retryAt + 20 * 60_000]) {
      page.clock.now = now
      for (let opened = 0; opened < 3; opened++)
        expect(await page.open(1, japaneseVideo)).toEqual({
          state: 'loading',
          videoId: japaneseVideo
        })
    }
    expect(page.storage.items.get('captions.tab.1')).toMatchObject({ captions: null })
    expect(page.youTube.sent.length).toBe(requests)
  })

  it('makes one request for Try again while waiting, and starts over at 15 minutes once lines come', async () => {
    const page = harness()
    page.youTube.answerTimedText(429)
    await page.open(1, japaneseVideo)
    const limited = await page.settled(1)
    page.youTube.answerTimedText(200)
    expect(await page.tryAgain(1)).toEqual({ state: 'loading', videoId: japaneseVideo })
    expect(lines(await page.settled(1))).toEqual(japaneseLines)
    expect(page.youTube.timedTextRequests()).toBe(2)
    expect(limited?.state === 'rate-limited' && limited.retryAt > page.clock.now).toBe(true)
    page.youTube.answerTimedText(429)
    await page.open(2, secondJapaneseVideo)
    const next = await page.settled(2)
    expect(next?.state === 'rate-limited' && next.retryAt - page.clock.now).toBeLessThanOrEqual(
      (rateLimitWaits[0] ?? 0) * (1 + rateLimitJitter)
    )
  })

  it('starts over at 15 minutes after any answer that is not a 429, such as a video with no Japanese captions', async () => {
    const { page, limited } = await rateLimitedOnce()
    page.clock.now = limited.retryAt
    await page.open(2, englishVideo)
    expect(await page.settled(2)).toEqual({ state: 'no-japanese-captions', videoId: englishVideo })
    await page.open(3, secondJapaneseVideo)
    const next = await page.settled(3)
    if (next?.state !== 'rate-limited') throw new Error('expected a rate limit')
    expect(next.retryAt - page.clock.now).toBeLessThanOrEqual(
      (rateLimitWaits[0] ?? 0) * (1 + rateLimitJitter)
    )
  })

  it('asks nothing for a tab whose YouTube video was closed, even once the wait is over', async () => {
    const page = harness()
    page.youTube.answerTimedText(429)
    await page.open(1, japaneseVideo)
    const limited = await page.settled(1)
    page.leave(1)
    page.clock.now = limited?.state === 'rate-limited' ? limited.retryAt : page.clock.now
    expect(await page.captions(1)).toEqual({ state: 'no-video' })
    expect(page.youTube.timedTextRequests()).toBe(1)
  })

  it('lets one tab try once the wait is over, and keeps the others waiting on its answer', async () => {
    const page = harness()
    page.youTube.answerTimedText(429)
    await page.open(1, japaneseVideo)
    await page.open(2, secondJapaneseVideo)
    const limited = await page.settled(2)
    if (limited?.state !== 'rate-limited') throw new Error('expected a rate limit')
    expect(page.youTube.timedTextRequests()).toBe(1)
    page.clock.now = limited.retryAt
    await Promise.all([page.open(1, japaneseVideo), page.open(2, secondJapaneseVideo)])
    const [first, second] = [await page.settled(1), await page.settled(2)]
    expect(page.youTube.timedTextRequests()).toBe(2)
    expect(first?.state).toBe('rate-limited')
    expect(second).toEqual(first && { ...first, videoId: secondJapaneseVideo })
  })

  it('frees the other tabs once a request YouTube leaves unanswered times out', async () => {
    const timeouts = controlledTimeouts()
    try {
      const page = harness()
      page.youTube.hangTimedText()
      await page.open(1, japaneseVideo)
      await page.open(2, secondJapaneseVideo)
      await vi.waitFor(() => expect(page.youTube.sent).toHaveLength(2))
      page.youTube.answerTimedText(200)
      timeouts.expire()
      expect(await page.settled(1)).toMatchObject({ state: 'failed' })
      expect(await page.settled(2)).toMatchObject({ state: 'lines', videoId: secondJapaneseVideo })
      expect(page.youTube.timedTextRequests()).toBe(2)
    } finally {
      timeouts.restore()
    }
  })

  it('asks YouTube nothing, and fails with the reason, when its requests could not be prepared', async () => {
    const page = harness()
    page.clock.unprepared = new Error(captionLabels.failed.unprepared)
    await page.open(1, japaneseVideo)
    expect(await page.settled(1)).toEqual({
      state: 'failed',
      videoId: japaneseVideo,
      reason: captionLabels.failed.unprepared
    })
    expect(page.youTube.sent).toEqual([])
    page.clock.unprepared = null
    await page.tryAgain(1)
    expect(lines(await page.settled(1))).toEqual(japaneseLines)
  })

  it('tries a failed video again only when asked to', async () => {
    const page = harness()
    page.youTube.answerTimedText(403)
    await page.open(1, japaneseVideo)
    expect(await page.settled(1)).toMatchObject({ state: 'failed' })
    page.youTube.answerTimedText(200)
    expect(await page.open(1, japaneseVideo)).toMatchObject({ state: 'failed' })
    expect(page.youTube.timedTextRequests()).toBe(1)
    await page.tryAgain(1)
    expect(lines(await page.settled(1))).toEqual(japaneseLines)
    expect(page.youTube.timedTextRequests()).toBe(2)
  })

  it("fails with the reason, and says so, when the session store refuses a video's lines", async () => {
    const storage = memoryStorage()
    const keep = storage.set
    const refuse = (refused: (values: Record<string, unknown>) => boolean) => {
      storage.set = values => (refused(values) ? Promise.reject(new Error('quota')) : keep(values))
    }
    const holdsLines = (values: Record<string, unknown>) =>
      JSON.stringify(values).includes('"state":"lines"')
    const page = harness({ storage })
    refuse(holdsLines)
    await page.open(1, japaneseVideo)
    const failed = { state: 'failed', videoId: japaneseVideo, reason: captionLabels.failed.unsaved }
    expect(await page.settled(1)).toEqual(failed)
    expect(await page.open(1, japaneseVideo)).toEqual(failed)

    refuse(values => !JSON.stringify(values).includes('"state":"loading"'))
    expect(await page.tryAgain(1)).toEqual({ state: 'loading', videoId: japaneseVideo })
    expect(await page.settled(1)).toEqual(failed)
  })
})
