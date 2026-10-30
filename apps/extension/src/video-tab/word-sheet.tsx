import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { Button } from '@zenbu/ui/components/button'
import { XIcon } from 'lucide-react'
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PageToken } from '../page-lookup/words'
import type { Settings } from '../shared/settings'
import type { VideoFollower } from '../video/follower'
import { hasOpenLayer } from '../word-popup/open-layer'
import { WordPopup } from '../word-popup/word-popup'
import { videoTabLabels } from './labels'
import type { VideoTabServices } from './services'

export type OpenedWord = { line: Caption; token: PageToken; full: boolean }

export type WordSheetState = {
  opened: OpenedWord | null
  open(line: Caption, token: PageToken, from: HTMLElement): void
  dismiss(): void
  closeQuietly(): void
  toggleFull(): void
}

type Player = Pick<VideoFollower, 'play' | 'pause'>

export function useWordSheet(video: Player, playing: () => boolean): WordSheetState {
  const [opened, setOpened] = useState<OpenedWord | null>(null)
  const isOpen = useRef(false)
  const resume = useRef(false)
  const opener = useRef<HTMLElement | null>(null)
  const actions = useMemo(() => {
    const close = (play: boolean) => {
      if (!isOpen.current) return
      isOpen.current = false
      setOpened(null)
      if (play && resume.current) video.play()
      resume.current = false
    }
    return {
      open(line: Caption, token: PageToken, from: HTMLElement) {
        if (!isOpen.current) {
          resume.current = playing()
          video.pause()
        }
        isOpen.current = true
        opener.current = from
        setOpened(previous => ({ line, token, full: previous?.full ?? false }))
      },
      dismiss() {
        const from = opener.current
        close(true)
        from?.focus({ preventScroll: true })
      },
      closeQuietly: () => close(false),
      toggleFull: () => setOpened(previous => previous && { ...previous, full: !previous.full })
    }
  }, [video, playing])
  useEffect(
    () => () => {
      if (isOpen.current && resume.current) video.play()
    },
    [video]
  )
  const showing = opened !== null
  const { dismiss } = actions
  useEffect(() => {
    if (!showing) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || hasOpenLayer(document)) return
      dismiss()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showing, dismiss])
  return { opened, ...actions }
}

const sheetClass =
  'absolute inset-x-0 bottom-0 z-10 flex h-[56%] flex-col rounded-t-xl border-t bg-popover text-popover-foreground shadow-[0_-10px_28px_rgb(0_0_0/0.14)] transition-[height] duration-200 motion-reduce:transition-none data-full:h-full data-full:rounded-none'

const grabClass =
  "col-start-2 grid h-5.5 w-14 cursor-pointer place-items-center justify-self-center rounded-md outline-none before:h-1.25 before:w-9 before:rounded-full before:bg-input before:content-[''] hover:before:bg-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"

const bodyClass =
  'min-h-0 flex-1 [&_[data-word-popup]]:h-full [&_[data-word-popup]]:max-h-none [&_[data-word-popup]]:w-full [&_[data-word-popup]]:max-w-full [&_[data-word-popup]]:rounded-none [&_[data-word-popup]]:border-0 [&_[data-word-popup]]:shadow-none'

export function WordSheet({
  ref,
  opened,
  settings,
  services,
  toggleFull,
  dismiss
}: {
  ref: RefObject<HTMLDivElement | null>
  opened: OpenedWord
  settings: Settings
  services: VideoTabServices
  toggleFull(): void
  dismiss(): void
}) {
  const frequency = settings['frequencyDictionaries.chosen']
  const lookUp = useCallback(
    (id: string) => services.popupCard(id, frequency),
    [services, frequency]
  )
  const { line, token, full } = opened
  return (
    <div ref={ref} data-word-sheet data-full={full ? '' : undefined} className={sheetClass}>
      <div className="grid grid-cols-[2rem_1fr_2rem] items-center px-2 pt-1">
        <button
          type="button"
          aria-label={full ? videoTabLabels.halfHeight : videoTabLabels.fullHeight}
          className={grabClass}
          onClick={toggleFull}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          className="col-start-3"
          aria-label={videoTabLabels.closeWord}
          onClick={dismiss}
        >
          <XIcon />
        </Button>
      </div>
      <div className={bodyClass}>
        <WordPopup
          key={`${line.id}:${token.start}`}
          text={token.text}
          ids={token.ids}
          lookUp={lookUp}
          settings={settings}
        />
      </div>
    </div>
  )
}
