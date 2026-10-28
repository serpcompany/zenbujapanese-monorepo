import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { hostElementName } from '../content/shadow-mount'
import { settingDefaults } from '../shared/settings'
import '../test/act-environment'
import { clockFollower, clockLines } from '../test/clock-follower'
import {
  captionServices,
  type PlayerOn,
  playerEachTest,
  standInFonts,
  wordPopup
} from '../test/player-on'
import { playerCaptionLabels as labels } from './labels'
import { playerCaptions, playerCaptionsAttribute } from './player-captions'

const opened = playerEachTest()

const press = (key: string, target: EventTarget = document) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }))
  })

const pointer = (type: string, target: Element) =>
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true }))
  })

async function clickWord(player: PlayerOn, text: string) {
  const word = player.word(text)
  expect(word).not.toBeNull()
  await act(async () => word?.click())
  await player.wait(0)
}

const popupText = () => wordPopup()?.shadowRoot?.textContent ?? ''

describe('the caption in the player', () => {
  it('sits in the follower’s caption host, shows the line being heard, and nothing between lines', async () => {
    const player = await opened()
    const host = player.player.querySelector(`[${playerCaptionsAttribute}]`)
    expect(host?.parentElement).toBe(player.player)
    expect(player.caption()).toBeNull()
    await player.playFrom(1.2)
    expect(player.line()).toBe('おはようございます')
    await player.playFrom(7)
    expect(player.caption()).toBeNull()
    await player.playFrom(8.5)
    expect(player.line()).toBe('散歩に行きましょう')
  })

  it('underlines the line’s words, and a word opens the word popup', async () => {
    const player = await opened()
    await player.playFrom(10.5)
    expect(player.word('要求')).not.toBeNull()
    expect(player.word('要る')).not.toBeNull()
    await clickWord(player, '要求')
    expect(wordPopup()).not.toBeNull()
    expect(popupText()).toContain('要求')
    expect(player.services.popupCard).toHaveBeenCalledWith(
      'youkyuu',
      settingDefaults['frequencyDictionaries.chosen']
    )
  })

  it('follows the reading aids, with romaji under the line once Romaji turns on', async () => {
    const player = await opened()
    await player.playFrom(10.5)
    const aids = () => player.caption()?.querySelector('[data-reading-aids]')
    expect(aids()?.getAttribute('data-romaji')).toBe('off')
    expect(aids()?.getAttribute('data-furigana')).toBe('on')
    await player.changeSettings({ 'readingAids.romaji': true, 'readingAids.furigana': false })
    expect(aids()?.getAttribute('data-romaji')).toBe('on')
    expect(aids()?.getAttribute('data-furigana')).toBe('off')
    expect(player.caption()?.querySelector('[data-aid="romaji"]')?.textContent).toBe(
      'youkyuu ga iru.'
    )
  })

  it('shows the line’s English under it, asking only to translate this line and the next', async () => {
    const player = await opened()
    await player.playFrom(1.2)
    expect(player.english()).toBe('Good morning.')
    expect(player.caption()?.querySelector('[data-aid="translation"]')?.getAttribute('lang')).toBe(
      'en'
    )
    const asked = player.services.translate.mock.calls.map(([request]) => request)
    expect(asked).toEqual([
      { type: 'translate', direction: { from: 'ja', to: 'en' }, texts: ['おはようございます'] },
      { type: 'translate', direction: { from: 'ja', to: 'en' }, texts: ['今日はいい天気ですね'] }
    ])
  })

  it('shows Japanese and romaji until the model is downloaded, and English once it is', async () => {
    const player = await opened({
      translator: 'downloadable',
      settings: { 'readingAids.romaji': true }
    })
    await player.playFrom(10.5)
    expect(player.line()).toBe('要求が要る。')
    expect(player.caption()?.querySelector('[data-aid="romaji"]')).not.toBeNull()
    expect(player.english()).toBeNull()
    player.translator.translator = 'available'
    await player.playFrom(1.2)
    await player.playFrom(10.5)
    expect(player.english()).toBe('It needs a demand.')
    for (const [request] of player.services.translate.mock.calls)
      expect(request.type).toBe('translate')
  })

  it('shows no English and asks for none while Translations is off', async () => {
    const player = await opened({ settings: { 'readingAids.translations': false } })
    await player.playFrom(1.2)
    expect(player.line()).toBe('おはようございます')
    expect(player.english()).toBeNull()
    expect(player.services.translate).not.toHaveBeenCalled()
  })
})

describe('the video while the word popup is open', () => {
  it('pauses, says so, and plays again when the popup closes', async () => {
    const player = await opened()
    await player.playFrom(10.5)
    await clickWord(player, '要求')
    expect(player.clock.playing()).toBe(false)
    expect(player.status()).toBe(labels.pausedForPopup)
    await press('Escape')
    await player.wait(0)
    expect(wordPopup()).toBeNull()
    expect(player.clock.playing()).toBe(true)
    expect(player.status()).toBe('')
  })

  it('stays paused after the popup closes when the video was paused when it opened', async () => {
    const player = await opened()
    player.clock.learnerSeeks(10.5)
    await player.wait(0)
    await clickWord(player, '要る')
    expect(player.status()).toBe('')
    await press('Escape')
    await player.wait(100)
    expect(player.clock.playing()).toBe(false)
  })

  it('keeps the video paused while the learner moves from one word to another', async () => {
    const player = await opened()
    const play = vi.spyOn(player.clock.follower, 'play')
    await player.playFrom(10.5)
    play.mockClear()
    await clickWord(player, '要求')
    const next = player.word('要る')
    if (!next) throw new Error('The caption lost a word.')
    await pointer('pointerdown', next)
    await pointer('pointerup', next)
    await clickWord(player, '要る')
    await player.wait(100)
    expect(play).not.toHaveBeenCalled()
    expect(player.clock.playing()).toBe(false)
    expect(popupText()).toContain('要る')
    expect(player.status()).toBe(labels.pausedForPopup)
  })
})

describe('during an ad', () => {
  it('shows no caption and no controls, and both come back after it', async () => {
    const player = await opened()
    await player.playFrom(1.2)
    expect(player.toolbar()).not.toBeNull()
    player.clock.adStarts()
    await player.wait(0)
    expect(player.caption()).toBeNull()
    expect(player.toolbar()).toBeNull()
    player.clock.adEnds()
    await player.wait(0)
    expect(player.line()).toBe('おはようございます')
    expect(player.toolbar()).not.toBeNull()
  })
})

describe('the page around the player', () => {
  it('keeps clicks and keys on the caption and controls from the player, but lets Escape through', async () => {
    const player = await opened()
    const clicks = vi.fn()
    const keys = vi.fn()
    player.player.addEventListener('click', clicks)
    player.player.addEventListener('pointerdown', clicks)
    document.addEventListener('keydown', keys)
    const next = player.button(labels.nextLine)
    if (!next) throw new Error('No Next line control.')
    await pointer('pointerdown', next)
    await act(async () => next.click())
    await press('k', next)
    expect(clicks).not.toHaveBeenCalled()
    expect(keys).not.toHaveBeenCalled()
    await press('Escape', next)
    expect(keys).toHaveBeenCalledOnce()
    document.removeEventListener('keydown', keys)
  })

  it('waits for the follower’s caption host, then moves into it', async () => {
    standInFonts()
    const clock = clockFollower()
    const show = playerCaptions({ services: captionServices().services })
    let stop = () => {}
    await act(async () => {
      stop = show(clock.follower, clockLines, settingDefaults).stop
    })
    expect(document.querySelector(hostElementName)).toBeNull()
    const player = document.body.appendChild(document.createElement('div'))
    clock.follower.captionHost = () => player
    clock.learnerPlays()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(player.querySelector(`[${playerCaptionsAttribute}]`)).not.toBeNull()
    act(() => stop())
    expect(player.querySelector(`[${playerCaptionsAttribute}]`)).toBeNull()
  })

  it('stopping takes the caption away and closes the popup, leaving the video paused', async () => {
    const player = await opened()
    await player.playFrom(10.5)
    await clickWord(player, '要求')
    await player.stop()
    expect(player.root()).toBeNull()
    expect(wordPopup()).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(player.clock.playing()).toBe(false)
  })
})
