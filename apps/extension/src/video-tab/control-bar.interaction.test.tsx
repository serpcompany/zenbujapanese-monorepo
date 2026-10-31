import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { playerCaptionLabels as labels } from '../player-captions/labels'
import { click, openMenu, settle } from '../test/render'
import { watching } from '../test/video-tab-harness'

let tab: ReturnType<typeof watching> | undefined

afterEach(() => {
  tab?.unmount()
  tab = undefined
  document.body.replaceChildren()
})

async function player() {
  tab = watching()
  await tab.show(true)
  await tab.lines()
  return tab
}

const bar = (shown: ReturnType<typeof watching>) =>
  shown.panel.querySelector<HTMLElement>('[data-control-bar]')

const barButton = (shown: ReturnType<typeof watching>, name: string) =>
  bar(shown)?.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)

describe('the Player tab’s control bar', () => {
  it('sits over the transcript with the time the video is at', async () => {
    const shown = await player()
    const transcript = shown.panel.querySelector('ol')
    expect(bar(shown)?.compareDocumentPosition(transcript as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
    expect(shown.text('[data-clock]')).toBe('0:00')
    await shown.playsAt(65.4)
    expect(shown.text('[data-clock]')).toBe('1:05')
  })

  it('plays and pauses the video, and its button says which it will do', async () => {
    const shown = await player()
    await click(barButton(shown, labels.play))
    await vi.waitFor(() => expect(shown.video.controls).toEqual([{ type: 'play' }]))
    await vi.waitFor(() => expect(barButton(shown, labels.pause)).toBeTruthy())
    await click(barButton(shown, labels.pause))
    await vi.waitFor(() =>
      expect(shown.video.controls).toEqual([{ type: 'play' }, { type: 'pause' }])
    )
  })

  it('goes to the next and previous lines while the video plays', async () => {
    const shown = await player()
    await shown.playsAt(6)
    await click(barButton(shown, labels.nextLine))
    await vi.waitFor(() => expect(shown.video.controls).toEqual([{ type: 'seek', time: 11.2 }]))
    await vi.waitFor(() => expect(shown.current()).toBe('散歩に行きましょう'))
    await click(barButton(shown, labels.previousLine))
    await vi.waitFor(() => expect(shown.video.controls.at(-1)).toEqual({ type: 'seek', time: 5.4 }))
  })

  it('paused, plays one line from Next', async () => {
    const shown = await player()
    await click(barButton(shown, labels.nextLine))
    await vi.waitFor(() =>
      expect(shown.video.controls).toEqual([{ type: 'seek', time: 0.5 }, { type: 'play' }])
    )
  })

  it('repeats the line from Repeat line, pressed until it is clicked again', async () => {
    const shown = await player()
    const repeat = () => barButton(shown, labels.repeatLine)
    expect(repeat()?.getAttribute('aria-pressed')).toBe('false')
    await click(repeat())
    expect(repeat()?.getAttribute('aria-pressed')).toBe('true')
    await vi.waitFor(() => expect(shown.video.controls).toEqual([{ type: 'seek', time: 0.5 }]))
    await click(repeat())
    expect(repeat()?.getAttribute('aria-pressed')).toBe('false')
  })

  it('sets the speed from 0.5× to 1.5× in its menu', async () => {
    const shown = await player()
    const menu = await openMenu(bar(shown) as HTMLElement)
    const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
    expect(items.map(item => item.textContent)).toEqual(['0.5×', '0.75×', '1×', '1.25×', '1.5×'])
    expect(items[2].getAttribute('aria-checked')).toBe('true')
    await click(items[4])
    await vi.waitFor(() => expect(shown.video.controls).toEqual([{ type: 'rate', rate: 1.5 }]))
    await vi.waitFor(() =>
      expect(bar(shown)?.querySelector('[aria-haspopup="menu"]')?.getAttribute('aria-label')).toBe(
        labels.speedMenu(1.5)
      )
    )
  })

  it('does nothing during an ad', async () => {
    const shown = await player()
    await act(async () => shown.video.adStarts())
    await settle()
    const buttons = [...(bar(shown)?.querySelectorAll('button') ?? [])]
    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons.every(button => button.disabled)).toBe(true)
  })
})
