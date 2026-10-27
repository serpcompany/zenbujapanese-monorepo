import { describe, expect, it } from 'vitest'
import { captionLabels } from './labels'
import {
  askCaptions,
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
    const opened = { type: 'video-opened', videoId: 'zenbuJa0001' }
    expect(
      await reply(answer, { target: 'service-worker', captions: opened }, { tab: { id: 7 } })
    ).toEqual([true, loading])
    expect(asked).toEqual([[opened, 7]])
    for (const message of [
      { target: 'service-worker', request: { type: 'ping' } },
      { target: 'offscreen', captions: opened },
      { target: 'service-worker', captions: { type: 'captions', tabId: 'seven' } },
      { target: 'service-worker', captions: { type: 'video-opened' } },
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
    expect(originRule('zenbuextensionid')).toEqual({
      id: 1,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'origin', operation: 'remove' }]
      },
      condition: {
        urlFilter: '|https://www.youtube.com/youtubei/',
        initiatorDomains: ['zenbuextensionid'],
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
