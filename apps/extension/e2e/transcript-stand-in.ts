import type { Page } from '@playwright/test'

export type StandInWord = { text: string; reading: string; languageReferenceID: string }

export type StandInLine = { start: number; text: string; tokens: StandInWord[] }

export type StandInMeaning = { meaning: string; partsOfSpeech: string[] }

export const word = (text: string, reading: string, id: string): StandInWord => ({
  text,
  reading,
  languageReferenceID: id
})

export const sense = (meaning: string, part: string): StandInMeaning => ({
  meaning,
  partsOfSpeech: [part]
})

type StandIn = {
  videoId: string
  time: number
  lines: StandInLine[]
  meanings: Record<string, StandInMeaning>
}

export function standInTranscript(page: Page, standIn: StandIn) {
  return page.addInitScript(({ videoId, time, lines, meanings }) => {
    const tab = { id: 624, url: `https://www.youtube.com/watch?v=${videoId}`, title: 'YouTube' }
    const query = chrome.tabs.query.bind(chrome.tabs)
    const playback = { videoId, time, playing: false, rate: 1, ad: false, ended: false }
    const event = (added?: (listener: (message: unknown) => void) => void) => ({
      addListener: (listener: (message: unknown) => void) => added?.(listener),
      removeListener: () => undefined
    })
    const port = () => ({
      name: 'video-tab',
      disconnect: () => undefined,
      onDisconnect: event(),
      onMessage: event(listener => setTimeout(() => listener({ target: 'video-tab', playback }), 0))
    })
    const captions = lines.map((line, id) => ({
      id,
      start: line.start,
      end: line.start + 4,
      text: line.text,
      translation: null
    }))
    const send = chrome.runtime.sendMessage.bind(chrome.runtime)
    const answer = (message: {
      captions?: unknown
      request?: { type?: string; text?: string; languageReferenceID?: string }
    }) => {
      if (message?.captions) return { state: 'lines', videoId, lines: captions }
      const request = message?.request
      if (request?.type === 'segment') {
        const tokens = lines.find(line => line.text === request.text)?.tokens ?? []
        return { type: 'segment', tokens, romaji: null }
      }
      if (request?.type === 'popup') {
        const meaning = meanings[request.languageReferenceID ?? '']
        return { type: 'popup', card: { card: { meanings: [meaning] }, romaji: null } }
      }
      return null
    }
    Object.assign(chrome.tabs, {
      query: (info: chrome.tabs.QueryInfo) => (info.active ? Promise.resolve([tab]) : query(info)),
      connect: port
    })
    Object.assign(chrome.runtime, {
      sendMessage: (...sent: Parameters<typeof send>) => {
        const answered = answer(sent[0] as Parameters<typeof answer>[0])
        return answered ? Promise.resolve(answered) : send(...sent)
      }
    })
  }, standIn)
}
