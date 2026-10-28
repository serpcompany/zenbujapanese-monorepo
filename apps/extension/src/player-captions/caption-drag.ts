import { type MouseEvent, type PointerEvent, useEffect, useRef, useState } from 'react'
import type { CaptionPlace } from '../shared/settings'
import { type Box, dragSlop, placeOf, shifted } from './caption-place'

export type KeepPlace = (place: CaptionPlace | null) => void

type Press = {
  pointer: number
  x: number
  y: number
  box: Box
  room: Box
  place: CaptionPlace | null
}

const boxOf = (element: Element): Box => {
  const { left, top, width, height } = element.getBoundingClientRect()
  return { left, top, width, height }
}

const onWord = (target: EventTarget) =>
  target instanceof Element && target.closest('[data-word]') !== null

export function useCaptionDrag(keep: KeepPlace) {
  const press = useRef<Press | null>(null)
  const [moving, setMoving] = useState<CaptionPlace | null>(null)

  useEffect(
    () => () => {
      const held = press.current
      press.current = null
      if (held?.place) keep(held.place)
    },
    [keep]
  )

  const follow = (event: PointerEvent<HTMLElement>) => {
    const held = press.current
    if (held?.pointer !== event.pointerId) return
    const x = event.clientX - held.x
    const y = event.clientY - held.y
    if (!held.place && Math.hypot(x, y) < dragSlop) return
    held.place = placeOf(shifted(held.box, x, y), held.room)
    setMoving(held.place)
  }

  const drop = () => {
    const held = press.current
    press.current = null
    if (held?.place) keep(held.place)
    setMoving(null)
  }

  return {
    moving,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        const room = event.currentTarget.parentElement
        if (event.button !== 0 || onWord(event.target) || !room) return
        press.current = {
          pointer: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          box: boxOf(event.currentTarget),
          room: boxOf(room),
          place: null
        }
        event.currentTarget.setPointerCapture(event.pointerId)
      },
      onPointerMove: follow,
      onPointerUp(event: PointerEvent<HTMLElement>) {
        follow(event)
        drop()
      },
      onPointerCancel: drop,
      onLostPointerCapture: drop,
      onDoubleClick(event: MouseEvent<HTMLElement>) {
        if (!onWord(event.target)) keep(null)
      }
    }
  }
}
