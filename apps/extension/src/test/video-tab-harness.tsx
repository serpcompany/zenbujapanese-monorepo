import type { SegmentedToken } from '@zenbu/dictionary-core/cards/segmentation'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, vi } from 'vitest'
import { japaneseVideo } from '../captions/fixtures/youtube-stand-in'
import type { PanelPage } from '../side-panel/route'
import type { TranslatorState } from '../translation/messages'
import { openVideoTab } from '../video/video-tab-port'
import type { ActiveTab, VideoTabServices } from '../video-tab/services'
import { VideoTab } from '../video-tab/video-tab'
import { startExtension } from './extension'
import { followerStandIn } from './follower-stand-in'
import { settle } from './render'
import { watchedTab } from './watched-tab'
import { popupAnswer } from './word-cards'

export const tabId = 5

export const watchURL = (videoId = japaneseVideo) => `https://www.youtube.com/watch?v=${videoId}`

export const lineEnglish: Record<string, string> = {
  おはようございます: 'Good morning.',
  '今日は"いい天気"ですね': 'Nice weather today, isn’t it?',
  散歩に行きましょう: 'Let’s go for a walk.'
}

const lineWords: Record<string, { tokens: SegmentedToken[]; romaji: string }> = {
  散歩に行きましょう: {
    tokens: [
      { text: '散歩', reading: 'サンポ', languageReferenceID: 'sanpo' },
      { text: 'に', reading: 'ニ' },
      { text: '行きましょう', reading: 'イキマショウ', languageReferenceID: 'iku' }
    ],
    romaji: 'sanpo ni ikimashou'
  },
  '今日は"いい天気"ですね': {
    tokens: [
      { text: '今日', reading: 'キョウ', languageReferenceID: 'kyou' },
      { text: 'は"いい' },
      { text: '天気', reading: 'テンキ', languageReferenceID: 'tenki' },
      { text: '"ですね' }
    ],
    romaji: 'kyou wa "ii tenki" desu ne'
  }
}

export function lineText(row: Element | null | undefined): string | undefined {
  const source = row?.querySelector('[data-source]')?.cloneNode(true)
  if (!(source instanceof HTMLElement)) return undefined
  for (const reading of source.querySelectorAll('rt, rp, [data-aid="meaning"]')) reading.remove()
  return source.textContent ?? undefined
}

const happyDOM = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM

function translatorStandIn(state: TranslatorState) {
  let current = state
  let finishDownload = () => {}
  const services = {
    translate: vi.fn<VideoTabServices['translate']>(async request => {
      if (request.type !== 'translate') return { type: 'availability', state: current }
      if (current !== 'available') return { type: 'not-available', state: current }
      return { type: 'translated', texts: request.texts.map(text => lineEnglish[text] ?? '') }
    }),
    availability: vi.fn<VideoTabServices['availability']>(async () => current),
    download: vi.fn<VideoTabServices['download']>(async (_direction, onProgress) => {
      onProgress(0.42)
      await new Promise<void>(resolve => {
        finishDownload = resolve
      })
      current = 'available'
      return current
    })
  } satisfies Pick<VideoTabServices, 'translate' | 'availability' | 'download'>
  return { services, finishDownload: () => act(async () => finishDownload()) }
}

type Options = { captionsOn?: boolean; translator?: TranslatorState; url?: string; title?: string }

export function watching({
  captionsOn = true,
  translator = 'available',
  url = watchURL(),
  title = '(2) 散歩の日 - YouTube'
}: Options = {}) {
  startExtension()
  happyDOM.setURL(url)
  const video = followerStandIn()
  const page = watchedTab({ tabId, captionsOn, follow: video.follow })
  const english = translatorStandIn(translator)
  const tabWatchers = new Set<() => void>()
  const site: { tab: ActiveTab | null } = { tab: { id: tabId, url, title } }
  const services = {
    ...english.services,
    segment: vi.fn<VideoTabServices['segment']>(async text => ({
      type: 'segment',
      tokens: lineWords[text]?.tokens ?? [{ text }],
      romaji: lineWords[text]?.romaji ?? null
    })),
    wait: vi.fn<VideoTabServices['wait']>(() => new Promise(() => {})),
    popupCard: vi.fn<VideoTabServices['popupCard']>(async id => popupAnswer(id)),
    activeTab: vi.fn(async () => site.tab),
    watchActiveTab: (changed: () => void) => {
      tabWatchers.add(changed)
      return () => void tabWatchers.delete(changed)
    },
    askCaptions: vi.fn<VideoTabServices['askCaptions']>(page.askCaptions),
    watchCaptions: page.watchCaptions,
    followPlayback: (watched: number, heard: Parameters<VideoTabServices['followPlayback']>[1]) =>
      openVideoTab(watched, heard, {
        connect: page.ports.connect,
        lastError: page.ports.lastError
      }),
    control: vi.fn<VideoTabServices['control']>((to, control) => {
      if (to === tabId) page.toContentScript({ target: 'video', control })
    })
  } satisfies VideoTabServices
  const panel = document.body.appendChild(document.createElement('main'))
  const root = createRoot(panel)
  const open = vi.fn<(page: PanelPage) => void>()
  const show = (shown: boolean) =>
    act(async () => root.render(<VideoTab services={services} open={open} shown={shown} />))
  const rows = () => [...panel.querySelectorAll<HTMLElement>('[data-line]')]
  return {
    page,
    video,
    services,
    finishDownload: english.finishDownload,
    panel,
    open,
    show,
    rows,
    row: (text: string) => rows().find(row => lineText(row) === text),
    current: () => lineText(panel.querySelector('[data-line][aria-current="true"]')),
    emptyTitle: () => panel.querySelector('[data-slot="empty-title"]')?.textContent,
    text: (selector: string) => panel.querySelector(selector)?.textContent?.trim(),
    button: (name: string) =>
      [...panel.querySelectorAll('button')].find(found => found.textContent?.trim() === name),
    async lines() {
      await vi.waitFor(() => expect(rows()).toHaveLength(3))
      await settle()
    },
    async move(tab: ActiveTab | null) {
      site.tab = tab
      await act(async () => {
        for (const watcher of [...tabWatchers]) watcher()
      })
      await settle()
    },
    async playsAt(time: number) {
      await act(async () => video.plays(time))
      await settle()
    },
    unmount() {
      act(() => root.unmount())
      page.stop()
    }
  }
}
