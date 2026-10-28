import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { Button } from '@zenbu/ui/components/button'
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { captionLabels } from '../captions/labels'
import type { GlossCache } from '../page-lookup/glosses'
import type { Settings } from '../shared/settings'
import type { PanelPage } from '../side-panel/route'
import { lineGlosses, SourceLine } from '../translate/source-words'
import { type Playback, playingLine } from '../video/follower'
import { popupPause } from '../video/popup-pause'
import { videoTabLabels } from './labels'
import type { VideoTabServices } from './services'

type PopupChanged = (id: number, open: boolean, dismiss: () => void) => void

type RowProps = {
  line: Caption
  current: boolean
  english: string | undefined
  englishFailed: boolean
  retryEnglish(text: string): void
  glosses: GlossCache
  settings: Settings | null
  services: VideoTabServices
  open(page: PanelPage): void
  seek(time: number): void
  popupChanged: PopupChanged
}

const rowClass =
  'relative flex gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/60 data-current:bg-muted motion-reduce:transition-none'

const timeClass =
  'shrink-0 cursor-pointer pt-1 text-xs text-muted-foreground tabular-nums outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-3 focus-visible:after:ring-ring/50'

const textClass =
  'pointer-events-none relative flex min-w-0 flex-1 flex-col gap-1 data-current:[&_[data-source]]:text-foreground [&_[data-word-popup]]:pointer-events-auto [&_[data-word-popup]]:w-full [&_button]:pointer-events-auto'

const Row = memo(function Row({
  line,
  current,
  english,
  englishFailed,
  retryEnglish,
  glosses,
  settings,
  services,
  open,
  seek,
  popupChanged
}: RowProps) {
  const onPopup = useCallback(
    (opened: boolean, dismiss: () => void) => popupChanged(line.id, opened, dismiss),
    [line.id, popupChanged]
  )
  const marked = current ? '' : undefined
  return (
    <li
      data-line={line.id}
      data-current={marked}
      aria-current={current ? 'true' : undefined}
      className={rowClass}
    >
      <button
        type="button"
        aria-label={videoTabLabels.goTo(line.start)}
        className={timeClass}
        onClick={() => seek(line.start)}
      >
        {videoTabLabels.clock(line.start)}
      </button>
      <div data-current={marked} className={textClass}>
        <SourceLine
          source={line.text}
          settings={settings}
          services={services}
          open={open}
          onPopup={onPopup}
          glosses={glosses}
        />
        {english ? (
          <p lang="en" data-english className="text-sm">
            {english}
          </p>
        ) : null}
        {!english && englishFailed ? (
          <div data-english-failed className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">{videoTabLabels.englishFailed}</p>
            <Button variant="outline" size="sm" onClick={() => retryEnglish(line.text)}>
              {captionLabels.tryAgain}
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  )
})

function usePopupPause(services: VideoTabServices, tabId: number, playing: () => boolean) {
  const open = useRef(new Map<number, () => void>())
  const pause = useMemo(
    () =>
      popupPause({
        playing,
        play: () => services.control(tabId, { type: 'play' }),
        pause: () => services.control(tabId, { type: 'pause' })
      }),
    [services, tabId, playing]
  )
  const popupChanged = useCallback<PopupChanged>(
    (id, opened, dismiss) => {
      const popups = open.current
      if (opened) {
        for (const [other, close] of popups) if (other !== id) close()
        popups.set(id, dismiss)
      } else popups.delete(id)
      pause.changed(popups.size > 0)
    },
    [pause]
  )
  const popupOpen = useCallback(() => open.current.size > 0, [])
  return { popupChanged, popupOpen }
}

function useFollowCurrent(current: number | null, shown: boolean, popupOpen: () => boolean) {
  const list = useRef<HTMLOListElement>(null)
  useEffect(() => {
    if (current === null || !shown || popupOpen()) return
    const row = list.current?.querySelector(`[data-line="${current}"]`)
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true
    row?.scrollIntoView?.({ block: 'center', behavior: still ? 'auto' : 'smooth' })
  }, [current, shown, popupOpen])
  return list
}

export function Transcript({
  lines,
  english,
  failed,
  retry,
  playback,
  tabId,
  shown,
  ...shared
}: {
  lines: readonly Caption[]
  english: ReadonlyMap<string, string>
  failed: ReadonlySet<string>
  retry(text: string): void
  playback: Playback | null
  tabId: number
  shown: boolean
  settings: Settings | null
  services: VideoTabServices
  open(page: PanelPage): void
}) {
  const latest = useRef(playback)
  latest.current = playback
  const playing = useCallback(() => latest.current?.playing === true, [])
  const { services } = shared
  const glosses = useMemo(() => lineGlosses(services), [services])
  const { popupChanged, popupOpen } = usePopupPause(services, tabId, playing)
  const at = playingLine(lines, playback)
  const current = at === null ? null : lines[at].id
  const list = useFollowCurrent(current, shown, popupOpen)
  const seek = useCallback(
    (time: number) => {
      if (latest.current?.ad) return
      services.control(tabId, { type: 'seek', time })
    },
    [services, tabId]
  )
  return (
    <ol ref={list} aria-label={videoTabLabels.transcript} className="flex flex-col gap-0.5">
      {lines.map(line => (
        <Row
          key={line.id}
          line={line}
          current={line.id === current}
          english={english.get(line.text)}
          englishFailed={failed.has(line.text)}
          retryEnglish={retry}
          glosses={glosses}
          seek={seek}
          popupChanged={popupChanged}
          {...shared}
        />
      ))}
    </ol>
  )
}
