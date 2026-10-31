import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import '../test/act-environment'
import { type PlayerOn, playerEachTest, wordPopup } from '../test/player-on'
import { playerCaptionLabels as labels } from './labels'
import { pointerIdle } from './presence'

const opened = playerEachTest()

const send = (target: Element, event: Event) =>
  act(() => {
    target.dispatchEvent(event)
  })

const pointerEvent = (type: string, init: PointerEventInit = {}) =>
  new PointerEvent(type, { bubbles: true, composed: true, ...init })

const control = (player: PlayerOn, label: string) => {
  const found = player.button(label)
  if (!found) throw new Error(`No ${label} control.`)
  return found
}

async function press(player: PlayerOn, label: string) {
  const found = control(player, label)
  await act(async () => found.click())
  await player.wait(0)
}

const speedTrigger = (player: PlayerOn) =>
  player.root()?.querySelector<HTMLElement>('[aria-haspopup="menu"]') ?? null

const speedMenu = (player: PlayerOn) =>
  player.root()?.querySelector<HTMLElement>('[role="menu"]') ?? null

async function openSpeeds(player: PlayerOn) {
  const trigger = speedTrigger(player)
  await act(async () => trigger?.click())
  await player.wait(0)
  const menu = speedMenu(player)
  if (!menu) throw new Error('The speed menu didn’t open.')
  return menu
}

const lineStarts = (player: PlayerOn) => player.clock.seeks.map(seek => seek.to)

describe('the line controls', () => {
  it('move to the next and previous line, repeat a line, and play and pause', async () => {
    const player = await opened()
    await player.playFrom(1.2)
    expect(control(player, labels.pause)).toBeDefined()
    await press(player, labels.nextLine)
    expect(player.line()).toBe('今日はいい天気ですね')
    await press(player, labels.previousLine)
    expect(lineStarts(player)).toEqual([3, 1])
    const repeat = control(player, labels.repeatLine)
    expect(repeat.getAttribute('aria-pressed')).toBe('false')
    await press(player, labels.repeatLine)
    expect(repeat.getAttribute('aria-pressed')).toBe('true')
    await player.wait(2500)
    expect(lineStarts(player).at(-1)).toBe(1)
    expect(player.line()).toBe('おはようございます')
    await press(player, labels.pause)
    expect(player.clock.playing()).toBe(false)
    expect(control(player, labels.play)).toBeDefined()
  })

  it('choose a speed from 0.5× to 1.5× in a menu inside the player’s shadow root', async () => {
    const player = await opened()
    await player.playFrom(1.2)
    expect(speedTrigger(player)?.getAttribute('aria-label')).toBe(labels.speedMenu(1))
    const menu = await openSpeeds(player)
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(menu.getRootNode()).toBe(player.root())
    const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
    expect(items.map(item => item.textContent)).toEqual(['0.5×', '0.75×', '1×', '1.25×', '1.5×'])
    expect(items[2].getAttribute('aria-checked')).toBe('true')
    await act(async () => items[1].click())
    await player.wait(0)
    expect(player.clock.rates).toEqual([0.75])
    expect(speedTrigger(player)?.getAttribute('aria-label')).toBe(labels.speedMenu(0.75))
    await player.wait(500)
    expect(speedMenu(player)).toBeNull()
  })
})

describe('when the controls show', () => {
  it('show while the video is paused, and hide while it plays', async () => {
    const player = await opened()
    expect(player.controlsShown()).toBe(true)
    await player.playFrom(1.2)
    expect(player.controlsShown()).toBe(false)
    player.clock.learnerPauses()
    await player.wait(0)
    expect(player.controlsShown()).toBe(true)
  })

  it('show while the pointer moves over the player, and hide when it rests or leaves', async () => {
    const player = await opened()
    await player.playFrom(1.2)
    await send(player.player, pointerEvent('pointermove'))
    expect(player.controlsShown()).toBe(true)
    await player.wait(pointerIdle - 100)
    expect(player.controlsShown()).toBe(true)
    await player.wait(200)
    expect(player.controlsShown()).toBe(false)
    await send(player.player, pointerEvent('pointermove'))
    expect(player.controlsShown()).toBe(true)
    await send(player.player, new PointerEvent('pointerleave'))
    expect(player.controlsShown()).toBe(false)
  })

  it('stay while the pointer rests on them', async () => {
    const player = await opened()
    await player.playFrom(1.2)
    const next = control(player, labels.nextLine)
    await send(next, pointerEvent('pointermove'))
    await send(next, pointerEvent('pointerover'))
    await player.wait(pointerIdle * 2)
    expect(player.controlsShown()).toBe(true)
    await send(next, pointerEvent('pointerout', { relatedTarget: player.player }))
    expect(player.controlsShown()).toBe(false)
  })

  it('show while a control has focus from the keyboard, but not after a click', async () => {
    const player = await opened()
    await player.playFrom(1.2)
    const next = control(player, labels.nextLine)
    await send(document.body, new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    await act(async () => next.focus())
    await player.wait(pointerIdle * 2)
    expect(player.controlsShown()).toBe(true)
    await act(async () => next.blur())
    expect(player.controlsShown()).toBe(false)
    await send(next, pointerEvent('pointerdown'))
    await act(async () => next.focus())
    expect(player.controlsShown()).toBe(false)
  })

  it('stay while the speed menu is open', async () => {
    const player = await opened()
    await player.playFrom(1.2)
    await openSpeeds(player)
    await player.wait(pointerIdle * 2)
    expect(player.controlsShown()).toBe(true)
    await act(async () => {
      speedMenu(player)?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true })
      )
    })
    await player.wait(500)
    expect(speedMenu(player)).toBeNull()
    await act(async () => (player.root()?.activeElement as HTMLElement | null)?.blur())
    expect(player.controlsShown()).toBe(false)
  })

  it('stay while the word popup is open', async () => {
    const player = await opened()
    player.clock.learnerSeeks(10.5)
    player.clock.learnerPlays()
    await player.wait(0)
    expect(player.controlsShown()).toBe(false)
    await act(async () => player.word('要求')?.click())
    await player.wait(0)
    expect(wordPopup()).not.toBeNull()
    expect(player.controlsShown()).toBe(true)
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    await player.wait(0)
    expect(wordPopup()).toBeNull()
    expect(player.controlsShown()).toBe(false)
  })
})

describe('the share of the video’s words known', () => {
  it('reads You know N% on the player, shows and hides with the controls, and rises when a word is marked Known', async () => {
    const player = await opened()
    await player.playFrom(1.2)
    await send(player.player, pointerEvent('pointermove'))
    expect(player.pill()?.textContent).toBe('You know 0%')
    expect(player.pill()?.hasAttribute('data-hidden')).toBe(false)
    await player.wait(pointerIdle + 100)
    expect(player.controlsShown()).toBe(false)
    expect(player.pill()?.hasAttribute('data-hidden')).toBe(true)
    await player.share.knows({ youkyuu: true, iru: true })
    expect(player.pill()?.textContent).toBe('You know 33%')
    expect(player.pill()?.querySelector('.text-orange-700')?.textContent).toBe('33%')
    expect(player.services.countWords).toHaveBeenCalledOnce()
    await player.share.refuse('signed-out')
    expect(player.pill()).toBeNull()
  })

  it('hides the pill while a Known lookup has failed, and shows the share again once the Known words next change', async () => {
    const player = await opened()
    await player.playFrom(1.2)
    await send(player.player, pointerEvent('pointermove'))
    await player.share.knows({ youkyuu: true, iru: true })
    expect(player.pill()?.textContent).toBe('You know 33%')
    player.services.knownWords.mockRejectedValue(new Error('No answer'))
    await player.share.knows(null)
    expect(player.pill()).toBeNull()
    player.services.knownWords.mockReset()
    player.services.knownWords.mockResolvedValue({ youkyuu: true, iru: true })
    await player.share.knows({ iru: true })
    await vi.waitFor(() => expect(player.pill()?.textContent).toBe('You know 33%'))
  })
})
