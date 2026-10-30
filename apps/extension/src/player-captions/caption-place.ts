import type { CSSProperties } from 'react'
import type { CaptionPlace } from '../shared/settings'

export type Box = { left: number; top: number; width: number; height: number }

const centred = 0.5

const shareOf = (offset: number, room: number) =>
  room > 0 ? Math.min(1, Math.max(0, offset / room)) : centred

export type Point = { x: number; y: number }

export const followed = (box: Box, pointer: Point, grip: Point): Box => ({
  ...box,
  left: pointer.x - Math.min(grip.x, box.width),
  top: pointer.y - Math.min(grip.y, box.height)
})

export const placeOf = (box: Box, room: Box): CaptionPlace => ({
  x: shareOf(box.left - room.left, room.width - box.width),
  y: shareOf(box.top - room.top, room.height - box.height)
})

const percent = (share: number) => `${share * 100}%`

export function placeStyle(place: CaptionPlace | null): CSSProperties {
  if (!place) return {}
  const x = percent(place.x)
  const y = percent(place.y)
  return { position: 'absolute', left: x, top: y, translate: `-${x} -${y}` }
}
