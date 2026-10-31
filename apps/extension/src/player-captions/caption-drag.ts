import { type MouseEvent, type PointerEvent, useEffect, useRef, useState } from 'react'
import type { CaptionPlace } from '../shared/settings'
import { type Box, followed, type Point, placeOf } from './caption-place'

export type KeepPlace = (place: CaptionPlace | null) => void

export const holdTime = 280

const holdSlop = 6

export type DragStage = 'pressed' | 'lifted'

type Press = {
  pointer: number
  x: number
  y: number
  grip: Point
  box: HTMLElement
  timer: ReturnType<typeof setTimeout>
  lifted: boolean
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
  const eatClick = useRef(false)
  const [stage, setStage] = useState<DragStage | null>(null)
  const [moving, setMoving] = useState<CaptionPlace | null>(null)

  useEffect(
    () => () => {
      const held = press.current
      press.current = null
      if (!held) return
      clearTimeout(held.timer)
      if (held.place) keep(held.place)
    },
    [keep]
  )

  const release = () => {
    const held = press.current
    press.current = null
    if (!held) return
    clearTimeout(held.timer)
    eatClick.current = held.place !== null
    if (held.place) keep(held.place)
    setStage(null)
    setMoving(null)
  }

  const lift = () => {
    const held = press.current
    if (!held) return
    held.lifted = true
    setStage('lifted')
  }

  const follow = (event: PointerEvent<HTMLElement>) => {
    const held = press.current
    if (held?.pointer !== event.pointerId) return
    const still = Math.hypot(event.clientX - held.x, event.clientY - held.y) <= holdSlop
    if (!held.lifted) {
      if (!still) release()
      return
    }
    if (!held.place && still) return
    held.box.setPointerCapture(held.pointer)
    const room = event.currentTarget.parentElement
    if (!room) return
    const pointer = { x: event.clientX, y: event.clientY }
    held.place = placeOf(followed(boxOf(event.currentTarget), pointer, held.grip), boxOf(room))
    setMoving(held.place)
  }

  return {
    moving,
    stage,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        eatClick.current = false
        if (event.button !== 0 || press.current) return
        const box = event.currentTarget
        const { left, top } = boxOf(box)
        press.current = {
          pointer: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          grip: { x: event.clientX - left, y: event.clientY - top },
          box,
          timer: setTimeout(lift, holdTime),
          lifted: false,
          place: null
        }
        setStage('pressed')
      },
      onPointerMove: follow,
      onPointerUp(event: PointerEvent<HTMLElement>) {
        follow(event)
        release()
      },
      onPointerCancel: release,
      onPointerLeave(event: PointerEvent<HTMLElement>) {
        const held = press.current
        if (!held?.lifted) return release()
        held.box.setPointerCapture(held.pointer)
        follow(event)
      },
      onLostPointerCapture(event: PointerEvent<HTMLElement>) {
        if (event.target === event.currentTarget) release()
      },
      onClickCapture(event: MouseEvent<HTMLElement>) {
        if (!eatClick.current) return
        eatClick.current = false
        event.stopPropagation()
        event.preventDefault()
      },
      onDoubleClick(event: MouseEvent<HTMLElement>) {
        if (!onWord(event.target)) keep(null)
      }
    }
  }
}
