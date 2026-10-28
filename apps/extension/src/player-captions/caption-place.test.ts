import { describe, expect, it } from 'vitest'
import { placeOf, placeStyle, shifted } from './caption-place'

const room = { left: 16, top: 0, width: 600, height: 400 }
const box = { left: 216, top: 300, width: 200, height: 60 }

describe('the caption’s place', () => {
  it('is the box’s offset as a share of the room the player leaves around it', () => {
    expect(placeOf(box, room)).toEqual({ x: 0.5, y: 300 / 340 })
    expect(placeOf({ ...box, left: 16, top: 0 }, room)).toEqual({ x: 0, y: 0 })
    expect(placeOf({ ...box, left: 416, top: 340 }, room)).toEqual({ x: 1, y: 1 })
  })

  it('moves by the pointer’s movement until the box meets an edge, and stops there', () => {
    expect(placeOf(shifted(box, 100, -150), room)).toEqual({ x: 0.75, y: 150 / 340 })
    expect(placeOf(shifted(box, -5000, -5000), room)).toEqual({ x: 0, y: 0 })
    expect(placeOf(shifted(box, 5000, 5000), room)).toEqual({ x: 1, y: 1 })
  })

  it('centres a box with no room to move in', () => {
    expect(placeOf({ ...box, width: 600, height: 500 }, room)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('draws a place inside the room at any size, and the default place with none', () => {
    expect(placeStyle({ x: 0.25, y: 1 })).toEqual({
      left: '25%',
      top: '100%',
      translate: '-25% -100%'
    })
    expect(placeStyle(null)).toEqual({
      left: '50%',
      bottom: 'max(64px, 12%)',
      translate: '-50% 0'
    })
  })
})
