import { type FocusEvent, useEffect, useRef, useState } from 'react'

export const pointerIdle = 3000

export type Presence = {
  pointer: boolean
  overControls: boolean
  focused: boolean
  paused: boolean
  menuOpen: boolean
  popupOpen: boolean
}

export const controlsShown = (presence: Presence): boolean => Object.values(presence).some(Boolean)

export function usePointerOver(player: HTMLElement | null, idle = pointerIdle): boolean {
  const [over, setOver] = useState(false)
  useEffect(() => {
    if (!player) return
    const view = player.ownerDocument.defaultView ?? window
    let timer: number | undefined
    const moved = () => {
      setOver(true)
      view.clearTimeout(timer)
      timer = view.setTimeout(() => setOver(false), idle)
    }
    const left = () => {
      view.clearTimeout(timer)
      setOver(false)
    }
    player.addEventListener('pointermove', moved)
    player.addEventListener('pointerleave', left)
    return () => {
      view.clearTimeout(timer)
      player.removeEventListener('pointermove', moved)
      player.removeEventListener('pointerleave', left)
    }
  }, [player, idle])
  return over
}

export function useFocusWithin(doc: Document = document) {
  const [focused, setFocused] = useState(false)
  const keyboard = useRef(false)
  useEffect(() => {
    const keyed = () => {
      keyboard.current = true
    }
    const pointed = () => {
      keyboard.current = false
    }
    doc.addEventListener('keydown', keyed, true)
    doc.addEventListener('pointerdown', pointed, true)
    return () => {
      doc.removeEventListener('keydown', keyed, true)
      doc.removeEventListener('pointerdown', pointed, true)
    }
  }, [doc])
  return {
    focused,
    onFocus: () => setFocused(keyboard.current),
    onBlur: (event: FocusEvent<HTMLElement>) => {
      const next = event.relatedTarget
      if (!(next instanceof Node) || !event.currentTarget.contains(next)) setFocused(false)
    }
  }
}
