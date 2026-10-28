import type { SegmentedToken } from '@zenbu/dictionary-core/cards/segmentation'
import { act } from 'react'
import { afterEach, beforeEach, vi } from 'vitest'
import {
  type CaptionServices,
  playerCaptions,
  playerCaptionsAttribute,
  type ShownCaptions
} from '../player-captions/player-captions'
import { type Settings, settingDefaults } from '../shared/settings'
import type { TranslatorState } from '../translation/messages'
import { clockFollower, clockVideo } from './clock-follower'
import { lineText } from './video-tab-harness'
import { popupAnswer } from './word-cards'

const clockEnglish: Record<string, string> = {
  おはようございます: 'Good morning.',
  今日はいい天気ですね: 'Nice weather today, isn’t it?',
  散歩に行きましょう: 'Let’s go for a walk.',
  '要求が要る。': 'It needs a demand.'
}

const clockWords: Record<string, { tokens: SegmentedToken[]; romaji: string }> = {
  '要求が要る。': {
    tokens: [
      { text: '要求', reading: 'ヨウキュウ', languageReferenceID: 'youkyuu' },
      { text: 'が', reading: 'ガ' },
      { text: '要る', reading: 'イル', languageReferenceID: 'iru' },
      { text: '。' }
    ],
    romaji: 'youkyuu ga iru.'
  }
}

export function captionServices(translator: TranslatorState = 'available') {
  const state = { translator }
  const services = {
    segment: vi.fn<CaptionServices['segment']>(async text => ({
      type: 'segment',
      tokens: clockWords[text]?.tokens ?? [{ text }],
      romaji: clockWords[text]?.romaji ?? null
    })),
    wait: vi.fn<CaptionServices['wait']>(() => new Promise(() => {})),
    popupCard: vi.fn(async (id: string) => popupAnswer(id)),
    openPanel: vi.fn<CaptionServices['openPanel']>(),
    keepCaptionPlace: vi.fn<CaptionServices['keepCaptionPlace']>(),
    translate: vi.fn<CaptionServices['translate']>(async request => {
      if (request.type !== 'translate') return { type: 'availability', state: state.translator }
      if (state.translator !== 'available')
        return { type: 'not-available', state: state.translator }
      return { type: 'translated', texts: request.texts.map(text => clockEnglish[text] ?? '') }
    })
  } satisfies CaptionServices
  return { services, state }
}

type Options = {
  settings?: Partial<Settings>
  translator?: TranslatorState
  duration?: number
}

export const wordPopup = () => document.querySelector('[data-zenbu-word-popup]')

class StandInFontFace {
  constructor(readonly family: string) {}
}

export function standInFonts() {
  vi.stubGlobal('FontFace', StandInFontFace)
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: new Set()
  })
}

async function playerOn({ settings = {}, translator, duration }: Options = {}) {
  standInFonts()
  const player = document.body.appendChild(document.createElement('div'))
  player.id = 'movie_player'
  const clock = clockFollower({ host: player, duration })
  const { services, state } = captionServices(translator)
  let current: Settings = { ...settingDefaults, ...settings }
  const show = playerCaptions({ services })
  let shown: ShownCaptions | undefined
  await act(async () => {
    shown = show(clock.follower, clockVideo, current)
  })
  const root = () =>
    player.querySelector<HTMLElement>(`[${playerCaptionsAttribute}]`)?.shadowRoot ?? null
  const toolbar = () => root()?.querySelector<HTMLElement>('[role="toolbar"]') ?? null
  const caption = () => root()?.querySelector<HTMLElement>('[data-player-caption]') ?? null
  const wait = (milliseconds: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(milliseconds)
    })
  return {
    player,
    clock,
    services,
    translator: state,
    root,
    toolbar,
    caption,
    wait,
    shown: () => shown as ShownCaptions,
    button: (label: string) =>
      root()?.querySelector<HTMLElement>(`button[aria-label="${label}"]`) ?? null,
    word: (text: string) =>
      root()?.querySelector<HTMLElement>(`[data-player-caption] [data-word="${text}"]`) ?? null,
    line: () => lineText(caption()),
    english: () => caption()?.querySelector('[data-aid="translation"]')?.textContent ?? null,
    status: () => root()?.querySelector('output')?.textContent ?? '',
    controlsShown: () => toolbar() !== null && !toolbar()?.hasAttribute('data-hidden'),
    async playFrom(time: number) {
      clock.learnerSeeks(time)
      clock.learnerPlays()
      await wait(0)
    },
    async changeSettings(next: Partial<Settings>) {
      current = { ...current, ...next }
      await act(async () => shown?.settingsChanged(current))
    },
    stop: () =>
      act(() => {
        shown?.stop()
        shown = undefined
      })
  }
}

export type PlayerOn = Awaited<ReturnType<typeof playerOn>>

export function playerEachTest() {
  let shown: PlayerOn | undefined
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']
    })
  })
  afterEach(async () => {
    await shown?.stop()
    shown = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })
  return async (options?: Options) => {
    shown = await playerOn(options)
    return shown
  }
}
