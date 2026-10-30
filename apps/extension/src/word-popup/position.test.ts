import { describe, expect, it } from 'vitest'
import { edgePlacement, outOfWindow, popupPlacement } from './position'

const window = { width: 1000, height: 800 }
const popup = { width: 320, height: 300 }
const word = (left: number, top: number) => ({ left, top, right: left + 40, bottom: top + 20 })

describe('where the word popup sits', () => {
  it('sits below its word when there is room', () => {
    expect(popupPlacement(word(100, 100), popup, window)).toEqual({
      side: 'below',
      left: 100,
      top: 128
    })
  })

  it('sits above a word near the bottom of the window', () => {
    expect(popupPlacement(word(100, 700), popup, window)).toEqual({
      side: 'above',
      left: 100,
      top: 392
    })
  })

  it('stays inside the window for a word at the right edge', () => {
    expect(popupPlacement(word(980, 100), popup, window).left).toBe(672)
  })

  it('stays inside the window for a word at the left edge', () => {
    expect(popupPlacement(word(-30, 100), popup, window).left).toBe(8)
  })

  it('stays inside a window too short for either side', () => {
    const placed = popupPlacement(word(100, 150), { width: 320, height: 700 }, window)
    expect(placed.top).toBeGreaterThanOrEqual(8)
    expect(placed.top + 700).toBeLessThanOrEqual(792)
  })

  it('keeps to the top margin when the popup is taller than the window', () => {
    expect(popupPlacement(word(100, 100), { width: 320, height: 900 }, window).top).toBe(8)
  })

  it('counts its word gone once the word is wholly outside the window', () => {
    expect(outOfWindow(word(100, -20), window)).toBe(true)
    expect(outOfWindow(word(100, 800), window)).toBe(true)
    expect(outOfWindow(word(-40, 100), window)).toBe(true)
    expect(outOfWindow(word(100, -19), window)).toBe(false)
    expect(outOfWindow(word(100, 799), window)).toBe(false)
  })
})

describe('a card beside the side panel', () => {
  it('sits at the page’s right edge, level with the row, for a panel on the right', () => {
    expect(edgePlacement({ side: 'right', top: 300 }, popup, window)).toEqual({
      side: 'beside',
      left: 672,
      top: 300
    })
  })

  it('sits at the page’s left edge for a panel on the left', () => {
    expect(edgePlacement({ side: 'left', top: 300 }, popup, window).left).toBe(8)
  })

  it('keeps inside the window when the row is lower than the card fits, or above the page', () => {
    expect(edgePlacement({ side: 'right', top: 700 }, popup, window).top).toBe(492)
    expect(edgePlacement({ side: 'right', top: -50 }, popup, window).top).toBe(8)
  })
})
