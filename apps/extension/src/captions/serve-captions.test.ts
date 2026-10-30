import { describe, expect, it } from 'vitest'
import { captionLabels } from './labels'
import {
  askCaptions,
  askTabTracks,
  type CaptionsAnswer,
  type CaptionsRequest,
  isCaptionsChange
} from './messages'
import { answerCaptions, originRule } from './serve-captions'

const loading = { state: 'loading', videoId: 'zenbuJa0001' } as const

function listener() {
  const asked: [CaptionsRequest, number | undefined][] = []
  const answer = answerCaptions({
    answer: async (request, senderTab) => {
      asked.push([request, senderTab])
      if (request.type === 'try-again') throw new Error('storage is gone')
      return loading
    }
  })
  return { asked, answer }
}

function reply(
  answer: ReturnType<typeof answerCaptions>,
  message: unknown,
  sender: { tab?: { id?: number } } = {}
) {
  return new Promise<[boolean, CaptionsAnswer]>(resolve => {
    const handled = answer(message, sender, response => resolve([handled, response]))
  })
}

describe('answerCaptions', () => {
  it("answers captions requests with the sender's tab, and leaves every other message alone", async () => {
    const { asked, answer } = listener()
    const opened = { type: 'video-opened', site: 'youtube', videoId: 'zenbuJa0001' }
    expect(
      await reply(answer, { target: 'service-worker', captions: opened }, { tab: { id: 7 } })
    ).toEqual([true, loading])
    expect(asked).toEqual([[opened, 7]])
    for (const message of [
      { target: 'service-worker', request: { type: 'ping' } },
      { target: 'offscreen', captions: opened },
      { target: 'service-worker', captions: { type: 'captions', tabId: 'seven' } },
      { target: 'service-worker', captions: { type: 'video-opened' } },
      { target: 'service-worker', captions: { ...opened, site: 'vimeo' } },
      null
    ]) {
      expect(answer(message, {}, () => undefined)).toBe(false)
    }
    expect(asked).toHaveLength(1)
  })

  it('answers a Failure when the service throws', async () => {
    const { answer } = listener()
    expect(
      await reply(answer, { target: 'service-worker', captions: { type: 'try-again', tabId: 3 } })
    ).toEqual([true, { type: 'failed', reason: 'storage is gone' }])
  })
})

describe('askCaptions', () => {
  it('turns a closed service worker into a Failure', async () => {
    const closed = {
      sendMessage: async () => {
        throw new Error('Could not establish connection. Receiving end does not exist.')
      }
    }
    expect(await askCaptions({ type: 'captions', tabId: 1 }, closed)).toEqual({
      type: 'failed',
      reason: 'Could not establish connection. Receiving end does not exist.'
    })
  })
})

describe('askTabTracks', () => {
  const tracks = { state: 'tracks', japanese: 'https://a.oca.nflxvideo.net/ja', english: null }

  const noWait = async () => undefined

  const always = () => true

  function tab(...answers: (() => Promise<unknown>)[]) {
    const sent: unknown[] = []
    return {
      sent,
      sendMessage: (...message: unknown[]) => {
        sent.push(message)
        return answers.shift()?.() ?? Promise.resolve(undefined)
      }
    }
  }

  it("asks the tab's top frame for a video's tracks, and takes a wrong answer as no player", async () => {
    const asked = tab(async () => tracks)
    expect(await askTabTracks(4, '81234567', always, asked, noWait)).toEqual(tracks)
    expect(asked.sent).toEqual([
      [4, { target: 'captions-tracks', videoId: '81234567' }, { frameId: 0 }]
    ])
    for (const answer of [{ state: 'tracks', japanese: 7 }, { state: 'lines' }]) {
      expect(
        await askTabTracks(
          4,
          '81234567',
          always,
          tab(async () => answer),
          noWait
        )
      ).toEqual({
        state: 'no-player'
      })
    }
  })

  it("asks again while the tab's content script isn't there yet or hasn't opened the video, then takes it as no player", async () => {
    const absent = () => Promise.reject(new Error('Receiving end does not exist.'))
    const late = tab(
      absent,
      async () => undefined,
      async () => tracks
    )
    expect(await askTabTracks(4, '81234567', always, late, noWait)).toEqual(tracks)
    expect(late.sent).toHaveLength(3)
    const never = tab()
    expect(await askTabTracks(4, '81234567', always, never, noWait)).toEqual({ state: 'no-player' })
    expect(never.sent).toHaveLength(20)
  })

  it('stops asking once the tab is no longer wanted, such as when it closed', async () => {
    const closed = () => Promise.reject(new Error('No tab with id: 4.'))
    const gone = tab(closed, closed, closed)
    let open = true
    const asking = askTabTracks(
      4,
      '81234567',
      () => open,
      gone,
      async () => {
        open = gone.sent.length < 2
      }
    )
    expect(await asking).toEqual({ state: 'no-player' })
    expect(gone.sent).toHaveLength(2)
  })
})

describe('isCaptionsChange', () => {
  it('accepts only a change of one tab with a state for a video', () => {
    expect(isCaptionsChange({ target: 'captions', tabId: 1, captions: loading })).toBe(true)
    expect(
      isCaptionsChange({ target: 'captions', tabId: 1, captions: { state: 'no-video' } })
    ).toBe(false)
    expect(isCaptionsChange({ target: 'video', tabId: 1, captions: loading })).toBe(false)
    expect(isCaptionsChange({ target: 'captions', captions: loading })).toBe(false)
  })
})

describe('originRule', () => {
  it("removes Origin only from the extension's own requests to YouTube's player API", () => {
    expect(originRule('zenbuextensionid', -1)).toEqual({
      id: 1,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'origin', operation: 'remove' }]
      },
      condition: {
        urlFilter: '|https://www.youtube.com/youtubei/',
        initiatorDomains: ['zenbuextensionid'],
        tabIds: [-1],
        requestMethods: ['post'],
        resourceTypes: ['xmlhttprequest']
      }
    })
  })
})

describe('captionLabels', () => {
  it('says when Zenbu will try again, in whole minutes', () => {
    const now = Date.UTC(2026, 9, 28)
    expect(captionLabels.rateLimited(now + 16.4 * 60_000, now)).toBe(
      "YouTube isn't sending captions to your network right now. Zenbu will try again in 17 minutes."
    )
    expect(captionLabels.rateLimited(now + 1_000, now)).toBe(
      "YouTube isn't sending captions to your network right now. Zenbu will try again in a minute."
    )
  })
})
