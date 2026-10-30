import { describe, expect, it } from 'vitest'
import { followed, placeOf, placeStyle } from './caption-place'

const room = { left: 16, top: 0, width: 600, height: 400 }
const box = { left: 216, top: 300, width: 200, height: 60 }
const grip = { x: 84, y: 30 }

describe('the caption’s place', () => {
  it('is the box’s offset as a share of the room the player leaves around it', () => {
    expect(placeOf(box, room)).toEqual({ x: 0.5, y: 300 / 340 })
    expect(placeOf({ ...box, left: 16, top: 0 }, room)).toEqual({ x: 0, y: 0 })
    expect(placeOf({ ...box, left: 416, top: 340 }, room)).toEqual({ x: 1, y: 1 })
  })

  it('moves by the pointer’s movement until the box meets an edge, and stops there', () => {
    const from = { x: 300, y: 330 }
    const by = (x: number, y: number) => followed(box, { x: from.x + x, y: from.y + y }, grip)
    expect(placeOf(by(100, -150), room)).toEqual({ x: 0.75, y: 150 / 340 })
    expect(placeOf(by(-5000, -5000), room)).toEqual({ x: 0, y: 0 })
    expect(placeOf(by(5000, 5000), room)).toEqual({ x: 1, y: 1 })
  })

  it('keeps the pointer where it held a box whose size changes, and inside a smaller one', () => {
    const wider = { ...box, width: 500, height: 90 }
    expect(followed(wider, { x: 150, y: 330 }, grip)).toMatchObject({ left: 66, top: 300 })
    expect(placeOf(followed(wider, { x: 150, y: 330 }, grip), room)).toEqual({
      x: 0.5,
      y: 300 / 310
    })
    const smaller = { ...box, width: 50, height: 20 }
    expect(followed(smaller, { x: 400, y: 330 }, grip)).toMatchObject({ left: 350, top: 310 })
  })

  it('centres a box with no room to move in', () => {
    expect(placeOf({ ...box, width: 600, height: 500 }, room)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('draws a place inside the room at any size, and leaves a box with none in the stack', () => {
    expect(placeStyle({ x: 0.25, y: 1 })).toEqual({
      position: 'absolute',
      left: '25%',
      top: '100%',
      translate: '-25% -100%'
    })
    expect(placeStyle(null)).toEqual({})
  })
})
