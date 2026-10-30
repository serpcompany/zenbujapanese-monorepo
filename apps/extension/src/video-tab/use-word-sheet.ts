import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PageToken } from '../page-lookup/words'
import type { VideoFollower } from '../video/follower'
import { hasOpenLayer } from '../word-popup/open-layer'
import type { PagePopup } from '../word-popup/page-popup'

export type OpenedWord = { line: Caption; token: PageToken; full: boolean }

export type WordSheetState = {
  opened: OpenedWord | null
  open(line: Caption, token: PageToken, from: HTMLElement): void
  dismiss(): void
  closeQuietly(): void
  toggleFull(): void
}

type Player = Pick<VideoFollower, 'play' | 'pause'>

type PageHold = { id: number; onPage: boolean; end(): void }

export function useWordSheet(
  video: Player,
  playing: () => boolean,
  shown: boolean,
  pagePopup?: PagePopup
): WordSheetState {
  const [opened, setOpened] = useState<OpenedWord | null>(null)
  const owed = useRef<{ resume: boolean } | null>(null)
  const hold = useRef<PageHold | null>(null)
  const holds = useRef(0)
  const opener = useRef<HTMLElement | null>(null)
  const actions = useMemo(() => {
    const finish = (play: boolean) => {
      const pause = owed.current
      if (!pause) return
      owed.current = null
      const held = hold.current
      hold.current = null
      held?.end()
      setOpened(null)
      if (play && pause.resume) video.play()
    }
    const holdPage = (token: PageToken) => {
      if (!pagePopup || (hold.current && !hold.current.onPage)) return
      const id = ++holds.current
      const mine = () => hold.current?.id === id
      const held: PageHold = { id, onPage: false, end: () => {} }
      hold.current = held
      held.end = pagePopup(
        { text: token.text, ids: token.ids, fromBottom: 0, inPanel: true },
        {
          shown: () => {},
          replaced: () => {
            if (!mine()) return
            held.onPage = true
            setOpened(null)
          },
          closed: () => mine() && finish(true),
          unavailable: () => {
            if (mine()) hold.current = null
          }
        }
      )
    }
    return {
      finish,
      open(line: Caption, token: PageToken, from: HTMLElement) {
        if (!owed.current) {
          owed.current = { resume: playing() }
          video.pause()
        }
        opener.current = from
        holdPage(token)
        setOpened(previous => ({ line, token, full: previous?.full ?? false }))
      },
      dismiss() {
        const from = opener.current
        finish(true)
        from?.focus({ preventScroll: true })
      },
      closeQuietly: () => finish(false),
      toggleFull: () => setOpened(previous => previous && { ...previous, full: !previous.full })
    }
  }, [video, playing, pagePopup])
  const { finish, ...state } = actions
  useEffect(() => () => finish(true), [finish])
  const showing = opened !== null
  const { dismiss } = actions
  useEffect(() => {
    if (!showing || !shown) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || hasOpenLayer(document)) return
      dismiss()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showing, shown, dismiss])
  return { opened, ...state }
}
