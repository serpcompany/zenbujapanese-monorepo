import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import '../test/act-environment'
import { type PlayerOn, playerEachTest, wordPopup } from '../test/player-on'

const opened = playerEachTest()

const room = { x: 16, y: 0, width: 600, height: 400 }
const box = { x: 216, y: 300, width: 200, height: 60 }

function measured(player: PlayerOn) {
  const caption = player.caption()
  const layer = caption?.parentElement
  if (!caption || !layer) throw new Error('No caption to drag.')
  caption.getBoundingClientRect = () => DOMRect.fromRect(box)
  layer.getBoundingClientRect = () => DOMRect.fromRect(room)
  return caption
}

const pointer = (type: string, target: Element, x: number, y: number) =>
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        composed: true,
        pointerId: 1,
        button: 0,
        clientX: x,
        clientY: y
      })
    )
  })

async function drag(target: Element, by: { x: number; y: number }) {
  await pointer('pointerdown', target, 300, 330)
  await pointer('pointermove', target, 300 + by.x / 2, 330 + by.y / 2)
  await pointer('pointermove', target, 300 + by.x, 330 + by.y)
  await pointer('pointerup', target, 300 + by.x, 330 + by.y)
}

const doubleClick = (target: Element) =>
  act(() => {
    target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }))
  })

const placed = (player: PlayerOn) => {
  const style = player.caption()?.style
  return { left: style?.left, top: style?.top }
}

const defaultPlace = { left: '50%', top: '' }

describe('dragging the caption', () => {
  it('moves the box by the pointer’s movement and keeps the place, with the video playing on', async () => {
    const player = await opened()
    await player.playFrom(10.5)
    const caption = measured(player)
    const heard = { presses: vi.fn(), moves: vi.fn() }
    for (const type of ['pointerdown', 'pointerup', 'click', 'mousedown'])
      player.player.addEventListener(type, heard.presses)
    player.player.addEventListener('pointermove', heard.moves)
    expect(placed(player)).toEqual(defaultPlace)
    await pointer('pointerdown', caption, 300, 330)
    await pointer('pointermove', caption, 400, 180)
    expect(caption.hasAttribute('data-dragging')).toBe(true)
    expect(placed(player)).toEqual({ left: '75%', top: `${(150 / 340) * 100}%` })
    await pointer('pointerup', caption, 400, 180)
    expect(caption.hasAttribute('data-dragging')).toBe(false)
    expect(player.services.keepCaptionPlace).toHaveBeenCalledExactlyOnceWith({
      x: 0.75,
      y: 150 / 340
    })
    expect(placed(player).left).toBe('75%')
    expect(heard.presses).not.toHaveBeenCalled()
    expect(heard.moves).toHaveBeenCalled()
    expect(player.clock.playing()).toBe(true)
    expect(player.clock.seeks).toEqual([])
  })

  it('keeps the box wholly inside the player at every edge', async () => {
    const player = await opened()
    await player.playFrom(10.5)
    const caption = measured(player)
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
      await drag(caption, by)
      expect(player.services.keepCaptionPlace).toHaveBeenLastCalledWith(place)
    }
  })

  it('moves nothing for a press that doesn’t move or a drag from a word, and a word still opens its popup after a drag', async () => {
    const player = await opened()
    await player.playFrom(10.5)
    const caption = measured(player)
    const word = player.word('要求')
    if (!word) throw new Error('The caption has no word.')
    await pointer('pointerdown', caption, 300, 330)
    await pointer('pointermove', caption, 301, 331)
    await pointer('pointerup', caption, 301, 331)
    await drag(word, { x: 100, y: -100 })
    expect(player.services.keepCaptionPlace).not.toHaveBeenCalled()
    expect(placed(player)).toEqual(defaultPlace)
    await drag(caption, { x: 100, y: -100 })
    expect(player.services.keepCaptionPlace).toHaveBeenCalledOnce()
    await act(async () => word.click())
    await player.wait(0)
    expect(wordPopup()).not.toBeNull()
  })

  it('goes back to its default place on a double-click on the background, not on a word', async () => {
    const player = await opened({ settings: { 'videos.captionPlace': { x: 0.1, y: 0.2 } } })
    await player.playFrom(10.5)
    expect(placed(player)).toEqual({ left: '10%', top: '20%' })
    const word = player.word('要る')
    if (!word) throw new Error('The caption has no word.')
    await doubleClick(word)
    expect(player.services.keepCaptionPlace).not.toHaveBeenCalled()
    await doubleClick(measured(player))
    expect(player.services.keepCaptionPlace).toHaveBeenCalledExactlyOnceWith(null)
    expect(placed(player)).toEqual(defaultPlace)
  })

  it('keeps the place across lines and settings changes, and keeps where it got to when the line ends mid-drag', async () => {
    const player = await opened({ settings: { 'videos.captionPlace': { x: 1, y: 0 } } })
    await player.playFrom(1.2)
    expect(placed(player)).toEqual({ left: '100%', top: '0%' })
    await player.changeSettings({ 'readingAids.romaji': true })
    await player.playFrom(10.5)
    expect(placed(player)).toEqual({ left: '100%', top: '0%' })
    const caption = measured(player)
    await pointer('pointerdown', caption, 300, 330)
    await pointer('pointermove', caption, 200, 330)
    await player.playFrom(7)
    expect(player.caption()).toBeNull()
    expect(player.services.keepCaptionPlace).toHaveBeenCalledExactlyOnceWith({
      x: 0.25,
      y: 300 / 340
    })
    await player.playFrom(8.5)
    expect(placed(player).left).toBe('25%')
  })
})
