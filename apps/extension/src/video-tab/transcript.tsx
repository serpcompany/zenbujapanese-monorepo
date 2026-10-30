import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { type Settings, settingsFrom } from '../shared/settings'
import type { Playback } from '../video/follower'
import { CaptionCard } from './caption-card'
import { ControlBar } from './control-bar'
import { videoTabLabels } from './labels'
import { currentCard, usePanelLines } from './panel-line-controls'
import type { VideoTabServices } from './services'
import { type OpenedWord, useWordSheet } from './use-word-sheet'
import { captionGlosses, useKnownWords } from './word-marks'
import { WordSheet } from './word-sheet'

const sheetGap = 16

const defaultSettings = settingsFrom({})

const still = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true

function center(box: HTMLElement | null, id: number) {
  const card = box?.querySelector(`[data-line="${id}"]`)
  card?.scrollIntoView?.({ block: 'center', behavior: still() ? 'auto' : 'smooth' })
}

function useFollow(current: number | null, shown: boolean, opened: OpenedWord | null) {
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLOListElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const covered = useRef<number | null>(null)
  useEffect(() => {
    if (current !== null && shown && !sheet.current) center(box.current, current)
  }, [current, shown])
  const line = opened?.line.id
  const full = opened?.full
  useLayoutEffect(() => {
    const scroller = box.current
    const cards = list.current
    if (!scroller || !cards) return
    if (line === undefined) {
      covered.current = null
      scroller.style.scrollPaddingBottom = ''
      cards.style.paddingBottom = ''
      return
    }
    if (full) return
    const bottom = scroller.getBoundingClientRect().bottom
    covered.current ??= Math.max(0, bottom - (sheet.current?.getBoundingClientRect().top ?? bottom))
    scroller.style.scrollPaddingBottom = `${covered.current}px`
    cards.style.paddingBottom = `${covered.current + sheetGap}px`
    center(scroller, line)
  }, [line, full])
  return { box, list, sheet }
}

type TranscriptProps = {
  lines: readonly Caption[]
  english: ReadonlyMap<string, string>
  failed: ReadonlySet<string>
  retry(text: string): void
  playback: Playback | null
  watched: { tabId: number; videoId: string }
  shown: boolean
  settings: Settings | null
  services: VideoTabServices
  notices: ReactNode
}

export function Transcript({
  lines,
  english,
  failed,
  retry,
  playback,
  watched,
  shown,
  settings,
  services,
  notices
}: TranscriptProps) {
  const { tabId, videoId } = watched
  const { controls, view, video } = usePanelLines(services, tabId, videoId, lines, playback)
  const latest = useRef({ playback, ready: false })
  latest.current = { playback, ready: view.ready && !view.ad }
  const playing = useCallback(() => latest.current.playback?.playing === true, [])
  const sheet = useWordSheet(video, playing, shown, services.pagePopup)
  const glosses = useMemo(() => captionGlosses(services), [services])
  const known = useKnownWords(services)
  const at = currentCard(lines, playback, view)
  const current = at === null ? null : lines[at].id
  const { box, list, sheet: sheetRef } = useFollow(current, shown, sheet.opened)
  const { closeQuietly, open } = sheet
  const playFrom = useCallback(
    (line: Caption) => {
      if (!latest.current.ready) return
      closeQuietly()
      controls.seek(line.start)
      video.play()
    },
    [closeQuietly, controls, video]
  )
  const chosen = sheet.opened
  return (
    <>
      <ControlBar controls={controls} view={view} time={playback?.time ?? 0} />
      <div hidden={chosen !== null}>{notices}</div>
      <div ref={box} className="relative min-h-0 flex-1 overflow-y-auto">
        <ol
          ref={list}
          aria-label={videoTabLabels.transcript}
          className="flex flex-col gap-2.5 p-2 pb-12"
        >
          {lines.map(line => (
            <CaptionCard
              key={line.id}
              line={line}
              current={line.id === current}
              english={english.get(line.text)}
              englishFailed={failed.has(line.text)}
              retryEnglish={retry}
              settings={settings}
              services={services}
              glosses={glosses}
              known={known}
              selected={chosen?.line.id === line.id ? chosen.token.start : null}
              playFrom={playFrom}
              open={open}
            />
          ))}
        </ol>
      </div>
      {chosen ? (
        <WordSheet
          ref={sheetRef}
          opened={chosen}
          settings={settings ?? defaultSettings}
          services={services}
          toggleFull={sheet.toggleFull}
          dismiss={sheet.dismiss}
        />
      ) : null}
    </>
  )
}
