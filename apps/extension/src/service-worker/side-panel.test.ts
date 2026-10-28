import { describe, expect, it, vi } from 'vitest'
import type { PanelRoute } from '../side-panel/route'
import { openOnToolbarClick, openPanelListener, type PanelWindows } from './side-panel'

const route: PanelRoute = { tab: 'words', page: { page: 'kanji', character: '猫' } }

const noGesture = '`sidePanel.open()` may only be called in response to a user gesture.'

function fakeWindows(open: PanelWindows['open'] = async () => undefined) {
  const calls: string[] = []
  const saved = new Map<number, PanelRoute>()
  const windows: PanelWindows = {
    open: vi.fn((windowId: number | null) => {
      calls.push(`open ${windowId}`)
      return open(windowId)
    }),
    focusedWindowId: async () => 12,
    saveRoute: async (windowId, saving) => {
      calls.push(`save ${windowId}`)
      saved.set(windowId, saving)
    },
    clearRoute: async windowId => {
      calls.push(`clear ${windowId}`)
      saved.delete(windowId)
    },
    tellPanel: vi.fn(async () => calls.push('tell'))
  }
  return { windows, calls, saved }
}

function send(windows: PanelWindows, message: unknown, sender: { tab?: { windowId: number } }) {
  const respond = vi.fn()
  const answer = new Promise(resolve => respond.mockImplementation(resolve))
  const keepsChannel = openPanelListener(windows)(message, sender, respond)
  return { keepsChannel, respond, answer }
}

const fromTab = { tab: { windowId: 7 } }

describe('openPanelListener', () => {
  it('opens the panel before it waits for anything, then hands the panel the route', async () => {
    const { windows, calls, saved } = fakeWindows()
    const { keepsChannel, answer } = send(
      windows,
      { target: 'service-worker', openPanel: route },
      fromTab
    )
    expect(keepsChannel).toBe(true)
    expect(calls).toEqual(['open 7'])
    await expect(answer).resolves.toEqual({ type: 'opened' })
    expect(calls).toEqual(['open 7', 'save 7', 'tell'])
    expect(saved.get(7)).toEqual(route)
    expect(windows.tellPanel).toHaveBeenCalledWith({ target: 'side-panel', windowId: 7, route })
  })

  it('opens the current window for an extension page that has no tab, and hands over to the focused window', async () => {
    const { windows, saved } = fakeWindows()
    const { answer } = send(windows, { target: 'service-worker', openPanel: route }, {})
    expect(windows.open).toHaveBeenCalledWith(null)
    await expect(answer).resolves.toEqual({ type: 'opened' })
    expect(saved.get(12)).toEqual(route)
  })

  it('takes the route back and answers a failure when Chrome will not open the panel', async () => {
    const { windows, calls, saved } = fakeWindows(() => Promise.reject(new Error(noGesture)))
    const { answer } = send(windows, { target: 'service-worker', openPanel: route }, fromTab)
    await expect(answer).resolves.toEqual({ type: 'failed', reason: noGesture })
    expect(calls).toEqual(['open 7', 'save 7', 'tell', 'clear 7'])
    expect(saved.size).toBe(0)
  })

  it('answers a failure, and opens nothing, for a route the panel does not have', () => {
    const { windows } = fakeWindows()
    const { keepsChannel, respond } = send(
      windows,
      { target: 'service-worker', openPanel: { tab: 'history' } },
      fromTab
    )
    expect(keepsChannel).toBe(false)
    expect(respond).toHaveBeenCalledWith({
      type: 'failed',
      reason: 'That is not a side panel route.'
    })
    expect(windows.open).not.toHaveBeenCalled()
  })

  it("leaves other messages to the other listeners, even the panel's own move", () => {
    const { windows } = fakeWindows()
    for (const message of [
      { target: 'service-worker', request: { type: 'ping' } },
      { target: 'side-panel', windowId: 7, route },
      null
    ]) {
      const { keepsChannel, respond } = send(windows, message, fromTab)
      expect(keepsChannel).toBe(false)
      expect(respond).not.toHaveBeenCalled()
    }
    expect(windows.open).not.toHaveBeenCalled()
  })
})

describe('openOnToolbarClick', () => {
  it('has Chrome open the panel from the toolbar icon, and reports nothing when Chrome agrees', async () => {
    const setPanelBehavior = vi.fn(async () => undefined)
    const reportFailure = vi.fn()
    await openOnToolbarClick(setPanelBehavior, reportFailure)
    expect(setPanelBehavior).toHaveBeenCalledExactlyOnceWith({ openPanelOnActionClick: true })
    expect(reportFailure).not.toHaveBeenCalled()
  })

  it('reports a refusal once, by its code alone, and leaves no rejection behind', async () => {
    const reportFailure = vi.fn()
    await expect(
      openOnToolbarClick(() => Promise.reject(new Error('No side panel here.')), reportFailure)
    ).resolves.toBeUndefined()
    expect(reportFailure.mock.calls).toEqual([['side-panel-behavior']])
  })
})
