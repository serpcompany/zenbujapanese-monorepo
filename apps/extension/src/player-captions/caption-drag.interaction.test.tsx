import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { captionPlacesReset } from '../shared/settings'
import '../test/act-environment'
import { type PlayerOn, playerEachTest, wordPopup } from '../test/player-on'
import { holdTime } from './caption-drag'

const opened = playerEachTest()

type Rect = { x: number; y: number; width: number; height: number }

const room = { x: 16, y: 0, width: 600, height: 400 }
const captionRect = { x: 216, y: 300, width: 200, height: 60 }
const englishRect = { x: 266, y: 370, width: 100, height: 20 }

function measured(element: HTMLElement | null, rect: Rect) {
  const layer = element?.parentElement
  if (!element || !layer) throw new Error('No box to drag.')
  element.getBoundingClientRect = () => DOMRect.fromRect(rect)
  layer.getBoundingClientRect = () => DOMRect.fromRect(room)
  return element
}

const pointer = (type: string, target: Element, x: number, y: number, button = 0) =>
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        composed: true,
        pointerId: 1,
        button,
        clientX: x,
        clientY: y
      })
    )
  })

async function hold(player: PlayerOn, target: Element, from = { x: 300, y: 330 }) {
  await pointer('pointerdown', target, from.x, from.y)
  await player.wait(holdTime)
}

async function drag(
  player: PlayerOn,
  target: Element,
  by: { x: number; y: number },
  from = { x: 300, y: 330 }
) {
  await hold(player, target, from)
  await pointer('pointermove', target, from.x + by.x / 2, from.y + by.y / 2)
  await pointer('pointermove', target, from.x + by.x, from.y + by.y)
  await pointer('pointerup', target, from.x + by.x, from.y + by.y)
}

const leave = (target: Element) =>
  act(() => {
    target.dispatchEvent(
      new PointerEvent('pointerout', {
        bubbles: true,
        composed: true,
        pointerId: 1,
        relatedTarget: document.body
      })
    )
  })

const doubleClick = (target: Element) =>
  act(() => {
    target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }))
  })

const placed = (box: HTMLElement | null) => ({
  position: box?.style.position,
  left: box?.style.left,
  top: box?.style.top
})

const unmoved = { position: '', left: '', top: '' }

const lifted = (box: HTMLElement) => box.hasAttribute('data-dragging')

describe('dragging the caption', () => {
  it('lifts the box after a quarter-second hold, then moves it by the pointer’s movement and keeps the place, with the video playing on', async () => {
    const player = await opened()
    await player.playFrom(10.5)
    const caption = measured(player.caption(), captionRect)
    const heard = { presses: vi.fn(), moves: vi.fn() }
    for (const type of ['pointerdown', 'pointerup', 'click', 'mousedown'])
      player.player.addEventListener(type, heard.presses)
    player.player.addEventListener('pointermove', heard.moves)
    expect(placed(caption)).toEqual(unmoved)
    await pointer('pointerdown', caption, 300, 330)
    expect(caption.hasAttribute('data-pressed')).toBe(true)
    await pointer('pointermove', caption, 303, 333)
    await player.wait(holdTime - 1)
    expect(lifted(caption)).toBe(false)
    await player.wait(1)
    expect(lifted(caption)).toBe(true)
    expect(placed(caption)).toEqual(unmoved)
    await pointer('pointermove', caption, 400, 180)
    expect(placed(caption)).toEqual({
      position: 'absolute',
      left: '75%',
      top: `${(150 / 340) * 100}%`
    })
    await pointer('pointerup', caption, 400, 180)
    expect(lifted(caption)).toBe(false)
    expect(caption.hasAttribute('data-pressed')).toBe(false)
    expect(player.services.keepCaptionPlaces).toHaveBeenCalledExactlyOnceWith({
      'videos.captionPlace': { x: 0.75, y: 150 / 340 }
    })
    expect(placed(caption).left).toBe('75%')
    expect(heard.presses).not.toHaveBeenCalled()
    expect(heard.moves).toHaveBeenCalled()
    expect(player.clock.playing()).toBe(true)
    expect(player.clock.seeks).toEqual([])
  })

  it('moves nothing for a quick press, a press that moves before the hold, or a press with another button, and a quick click on a word opens its popup', async () => {
    const player = await opened()
    await player.playFrom(10.5)
    const caption = measured(player.caption(), captionRect)
    await pointer('pointerdown', caption, 300, 330)
    await player.wait(holdTime - 1)
    await pointer('pointerup', caption, 300, 330)
    await player.wait(holdTime)
    expect(lifted(caption)).toBe(false)
    await pointer('pointerdown', caption, 300, 330)
    await pointer('pointermove', caption, 307, 330)
    await player.wait(holdTime)
    await pointer('pointermove', caption, 400, 230)
    await pointer('pointerup', caption, 400, 230)
    expect(lifted(caption)).toBe(false)
    for (const button of [1, 2]) {
      await pointer('pointerdown', caption, 300, 330, button)
      await player.wait(holdTime)
      await pointer('pointermove', caption, 400, 230, button)
      await pointer('pointerup', caption, 400, 230, button)
    }
    expect(lifted(caption)).toBe(false)
    expect(player.services.keepCaptionPlaces).not.toHaveBeenCalled()
    expect(placed(caption)).toEqual(unmoved)
    const word = player.word('要求')
    if (!word) throw new Error('The caption has no word.')
    await pointer('pointerdown', word, 260, 320)
    await pointer('pointerup', word, 260, 320)
    await act(async () => word.click())
    await player.wait(0)
    expect(wordPopup()).not.toBeNull()
  })

  it('drags the caption from a word held for a quarter second, opening no popup for it, and the word opens its popup on the next click', async () => {
    const player = await opened()
    await player.playFrom(10.5)
    const caption = measured(player.caption(), captionRect)
    const word = player.word('要求')
    if (!word) throw new Error('The caption has no word.')
    await drag(player, word, { x: 100, y: -150 })
    expect(player.services.keepCaptionPlaces).toHaveBeenCalledExactlyOnceWith({
      'videos.captionPlace': { x: 0.75, y: 150 / 340 }
    })
    await act(async () => word.click())
    await player.wait(0)
    expect(wordPopup()).toBeNull()
    expect(placed(caption).left).toBe('75%')
    await pointer('pointerdown', word, 360, 180)
    await pointer('pointerup', word, 360, 180)
    await act(async () => word.click())
    await player.wait(0)
    expect(wordPopup()).not.toBeNull()
  })

  it('opens the word’s popup for a press held past the quarter second that never moves the box, however long, and keeps no place', async () => {
    const player = await opened()
    await player.playFrom(10.5)
    const caption = measured(player.caption(), captionRect)
    const word = player.word('要求')
    if (!word) throw new Error('The caption has no word.')
    await hold(player, word, { x: 260, y: 320 })
    expect(lifted(caption)).toBe(true)
    await player.wait(2000)
    await pointer('pointermove', word, 263, 323)
    await pointer('pointerup', word, 263, 323)
    expect(lifted(caption)).toBe(false)
    expect(caption.hasPointerCapture(1)).toBe(false)
    await act(async () => word.click())
    await player.wait(0)
    expect(wordPopup()).not.toBeNull()
    expect(player.services.keepCaptionPlaces).not.toHaveBeenCalled()
    expect(placed(caption)).toEqual(unmoved)
  })

  it('lets a press go when the pointer leaves the box before the hold, and keeps dragging a lifted box when the pointer leaves it', async () => {
    const player = await opened()
    await player.playFrom(10.5)
    const caption = measured(player.caption(), captionRect)
    await pointer('pointerdown', caption, 300, 330)
    await leave(caption)
    expect(caption.hasAttribute('data-pressed')).toBe(false)
    await player.wait(holdTime)
    expect(lifted(caption)).toBe(false)
    await hold(player, caption)
    expect(caption.hasPointerCapture(1)).toBe(false)
    await leave(caption)
    expect(lifted(caption)).toBe(true)
    expect(caption.hasPointerCapture(1)).toBe(true)
    await pointer('pointermove', caption, 400, 180)
    await pointer('pointerup', caption, 400, 180)
    expect(player.services.keepCaptionPlaces).toHaveBeenCalledExactlyOnceWith({
      'videos.captionPlace': { x: 0.75, y: 150 / 340 }
    })
  })

  it('ends a drag where it got to when the browser cancels the pointer or the box loses its capture, but not when a word inside loses one', async () => {
    const player = await opened()
    await player.playFrom(10.5)
    const caption = measured(player.caption(), captionRect)
    const word = player.word('要求')
    if (!word) throw new Error('The caption has no word.')
    await hold(player, caption)
    await pointer('pointermove', caption, 400, 180)
    await pointer('pointercancel', caption, 400, 180)
    expect(lifted(caption)).toBe(false)
    expect(player.services.keepCaptionPlaces).toHaveBeenLastCalledWith({
      'videos.captionPlace': { x: 0.75, y: 150 / 340 }
    })
    await hold(player, caption)
    await pointer('pointermove', caption, 200, 330)
    await pointer('lostpointercapture', word, 200, 330)
    expect(lifted(caption)).toBe(true)
    await pointer('lostpointercapture', caption, 200, 330)
    expect(lifted(caption)).toBe(false)
    expect(player.services.keepCaptionPlaces).toHaveBeenCalledTimes(2)
    expect(player.services.keepCaptionPlaces).toHaveBeenLastCalledWith({
      'videos.captionPlace': { x: 0.25, y: 300 / 340 }
    })
  })

  it('keeps the box under the pointer when one line runs straight into the next mid-drag', async () => {
    const player = await opened()
    await player.playFrom(2.5)
    const caption = measured(player.caption(), captionRect)
    expect(player.line()).toBe('おはようございます')
    await hold(player, caption)
    await pointer('pointermove', caption, 400, 330)
    expect(placed(caption).left).toBe('75%')
    await player.wait(1000)
    expect(player.line()).toBe('今日はいい天気ですね')
    expect(player.caption()).toBe(caption)
    caption.getBoundingClientRect = () => DOMRect.fromRect({ ...captionRect, width: 500 })
    await pointer('pointermove', caption, 150, 330)
    expect(placed(caption).left).toBe(`${((150 - 84 - 16) / 100) * 100}%`)
    await pointer('pointermove', caption, 120, 330)
    expect(placed(caption).left).toBe(`${((120 - 84 - 16) / 100) * 100}%`)
    await pointer('pointerup', caption, 120, 330)
    expect(player.services.keepCaptionPlaces).toHaveBeenCalledExactlyOnceWith({
      'videos.captionPlace': { x: (120 - 84 - 16) / 100, y: 300 / 340 }
    })
  })

  it('keeps the box wholly inside the player at every edge', async () => {
    const player = await opened()
    await player.playFrom(10.5)
    const caption = measured(player.caption(), captionRect)
    for (const [by, place] of [
      [
        { x: -5000, y: -5000 },
        { x: 0, y: 0 }
      ],
      [
        { x: 5000, y: 5000 },
        { x: 1, y: 1 }
      ],
      [
        { x: -5000, y: 5000 },
        { x: 0, y: 1 }
      ],
      [
        { x: 5000, y: -5000 },
        { x: 1, y: 0 }
      ]
    ] as const) {
      await drag(player, caption, by)
      expect(player.services.keepCaptionPlaces).toHaveBeenLastCalledWith({
        'videos.captionPlace': place
      })
    }
  })

  it('drags the English on its own, leaving the caption where it was, and keeps each place apart', async () => {
    const player = await opened()
    await player.playFrom(1.2)
    const english = measured(player.translation(), englishRect)
    const caption = measured(player.caption(), captionRect)
    await drag(player, english, { x: -100, y: -200 }, { x: 300, y: 380 })
    expect(player.services.keepCaptionPlaces).toHaveBeenCalledExactlyOnceWith({
      'videos.translationPlace': { x: 0.3, y: 170 / 380 }
    })
    expect(placed(english)).toEqual({
      position: 'absolute',
      left: '30%',
      top: `${(170 / 380) * 100}%`
    })
    expect(placed(caption)).toEqual(unmoved)
    await drag(player, caption, { x: 100, y: -150 })
    expect(player.services.keepCaptionPlaces).toHaveBeenLastCalledWith({
      'videos.captionPlace': { x: 0.75, y: 150 / 340 }
    })
    expect(placed(english).left).toBe('30%')
    expect(placed(caption).left).toBe('75%')
  })

  it('puts a box back on a double-click on its background, not on a word, leaving the other where it is', async () => {
    const moved = { x: 0.1, y: 0.2 }
    const player = await opened({
      settings: { 'videos.captionPlace': moved, 'videos.translationPlace': moved }
    })
    await player.playFrom(10.5)
    const caption = measured(player.caption(), captionRect)
    expect(placed(caption)).toEqual({ position: 'absolute', left: '10%', top: '20%' })
    const word = player.word('要る')
    if (!word) throw new Error('The caption has no word.')
    await doubleClick(word)
    expect(player.services.keepCaptionPlaces).not.toHaveBeenCalled()
    await doubleClick(caption)
    expect(player.services.keepCaptionPlaces).toHaveBeenCalledExactlyOnceWith({
      'videos.captionPlace': null
    })
    expect(placed(caption)).toEqual(unmoved)
    const english = player.translation()
    if (!english) throw new Error('The line has no English.')
    expect(placed(english).left).toBe('10%')
    await doubleClick(english)
    expect(player.services.keepCaptionPlaces).toHaveBeenLastCalledWith({
      'videos.translationPlace': null
    })
    expect(placed(english)).toEqual(unmoved)
  })

  it('puts both boxes back at the bottom, the English under the caption, when both places are cleared', async () => {
    const player = await opened({
      settings: {
        'videos.captionPlace': { x: 0.5, y: 0 },
        'videos.translationPlace': { x: 0, y: 1 }
      }
    })
    await player.playFrom(1.2)
    expect(placed(player.caption()).top).toBe('0%')
    expect(placed(player.translation()).top).toBe('100%')
    await player.changeSettings(captionPlacesReset)
    expect(placed(player.caption())).toEqual(unmoved)
    expect(placed(player.translation())).toEqual(unmoved)
    expect(player.caption()?.nextElementSibling).toBe(player.translation())
    expect(player.services.keepCaptionPlaces).not.toHaveBeenCalled()
  })

  it('keeps the place across lines and settings changes, and keeps where it got to when the line ends mid-drag', async () => {
    const player = await opened({ settings: { 'videos.captionPlace': { x: 1, y: 0 } } })
    await player.playFrom(1.2)
    expect(placed(player.caption())).toEqual({ position: 'absolute', left: '100%', top: '0%' })
    await player.changeSettings({ 'readingAids.romaji': true })
    await player.playFrom(10.5)
    expect(placed(player.caption()).left).toBe('100%')
    const caption = measured(player.caption(), captionRect)
    await hold(player, caption)
    await pointer('pointermove', caption, 200, 330)
    await player.playFrom(7)
    expect(player.caption()).toBeNull()
    expect(player.services.keepCaptionPlaces).toHaveBeenCalledExactlyOnceWith({
      'videos.captionPlace': { x: 0.25, y: 300 / 340 }
    })
    await player.playFrom(8.5)
    expect(placed(player.caption()).left).toBe('25%')
  })

  it('lifts nothing when the line ends during the hold', async () => {
    const player = await opened()
    await player.playFrom(6.4)
    const caption = player.caption()
    if (!caption) throw new Error('No caption.')
    await pointer('pointerdown', caption, 300, 330)
    await player.wait(holdTime)
    expect(player.caption()).toBeNull()
    await player.playFrom(8.5)
    expect(player.caption()?.hasAttribute('data-dragging')).toBe(false)
    expect(player.services.keepCaptionPlaces).not.toHaveBeenCalled()
  })
})
