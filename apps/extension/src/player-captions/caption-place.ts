import type { CSSProperties } from 'react'
import type { CaptionPlace } from '../shared/settings'

export type Box = { left: number; top: number; width: number; height: number }

export const dragSlop = 3

const centred = 0.5

const shareOf = (offset: number, room: number) =>
  room > 0 ? Math.min(1, Math.max(0, offset / room)) : centred

export const shifted = (box: Box, x: number, y: number): Box => ({
  ...box,
  left: box.left + x,
  top: box.top + y
})

export const placeOf = (box: Box, room: Box): CaptionPlace => ({
  x: shareOf(box.left - room.left, room.width - box.width),
  y: shareOf(box.top - room.top, room.height - box.height)
})

const defaultPlace: CSSProperties = { left: '50%', bottom: 'max(64px, 12%)', translate: '-50% 0' }

const percent = (share: number) => `${share * 100}%`

export function placeStyle(place: CaptionPlace | null): CSSProperties {
  if (!place) return defaultPlace
  const x = percent(place.x)
  const y = percent(place.y)
  return { left: x, top: y, translate: `-${x} -${y}` }
}
