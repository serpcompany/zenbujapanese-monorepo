import { afterEach, describe, expect, it, vi } from 'vitest'
import { goBack, goTo, openPage, selectTab, startState } from './navigation'
import { isPanelRoute, type OpenPanel, openPanel, type PanelPage, routeForWindow } from './route'

afterEach(() => vi.unstubAllEnvs())

const word: PanelPage = { page: 'word', entSeq: 1358280, entries: [1358280, 2028920] }
const kanji: PanelPage = { page: 'kanji', character: '猫' }

describe('isPanelRoute', () => {
  it('takes a tab, a page, both, or neither', () => {
    expect(isPanelRoute({})).toBe(true)
    expect(isPanelRoute({ tab: 'player' })).toBe(true)
    expect(isPanelRoute({ page: word })).toBe(true)
    expect(isPanelRoute({ tab: 'account', page: { page: 'form', form: '食べた' } })).toBe(true)
    expect(isPanelRoute({ page: { page: 'test', text: '猫' } })).toBe(true)
    expect(isPanelRoute({ tab: 'translate', page: { page: 'image-search' } })).toBe(true)
  })

  it('refuses a tab or page the panel does not have, or a page with the wrong fields', () => {
    expect(isPanelRoute(null)).toBe(false)
    expect(isPanelRoute({ tab: 'history' })).toBe(false)
    expect(isPanelRoute({ tab: 'video' })).toBe(false)
    expect(isPanelRoute({ page: { page: 'settings' } })).toBe(false)
    expect(isPanelRoute({ page: { page: 'toString' } })).toBe(false)
    expect(isPanelRoute({ page: { page: 'word', entSeq: '1358280' } })).toBe(false)
    expect(isPanelRoute({ page: { page: 'word', entSeq: 1358280, entries: ['x'] } })).toBe(false)
    expect(isPanelRoute({ page: { page: 'kanji', character: 7 } })).toBe(false)
  })

  it('refuses the test page outside the test build', () => {
    vi.stubEnv('MODE', 'production')
    expect(isPanelRoute({ page: { page: 'test', text: '猫' } })).toBe(false)
  })
})

describe('routeForWindow', () => {
  const move = { target: 'side-panel', windowId: 7, route: { page: kanji } }

  it("takes a move for the panel's own window", () => {
    expect(routeForWindow(7, move)).toEqual({ page: kanji })
  })

  it("ignores another window's move, another target, and a broken route", () => {
    expect(routeForWindow(8, move)).toBeNull()
    expect(routeForWindow(7, { ...move, target: 'offscreen' })).toBeNull()
    expect(routeForWindow(7, { ...move, route: { tab: 'history' } })).toBeNull()
    expect(routeForWindow(7, 'side-panel')).toBeNull()
  })
})

describe('openPanel', () => {
  it('asks the service worker to open the panel on the route', async () => {
    const sendMessage = vi.fn(async (_message: OpenPanel) => ({ type: 'opened' }))
    await expect(
      openPanel({ tab: 'account', page: word }, { sendMessage })
    ).resolves.toBeUndefined()
    expect(sendMessage).toHaveBeenCalledWith({
      target: 'service-worker',
      openPanel: { tab: 'account', page: word }
    })
  })

  it('settles quietly when the service worker cannot be reached', async () => {
    const sendMessage = () => Promise.reject(new Error('Extension context invalidated.'))
    await expect(openPanel({ page: kanji }, { sendMessage })).resolves.toBeUndefined()
  })
})

describe('navigation', () => {
  it('keeps a stack of pages for each tab, and Back pops one page of the current tab', () => {
    const onLookUp = openPage(openPage(startState('lookUp'), word), kanji)
    const onAccount = openPage(selectTab(onLookUp, 'account'), word)
    expect(onAccount.stacks.lookUp.map(stacked => stacked.page)).toEqual([word, kanji])
    expect(onAccount.stacks.account.map(stacked => stacked.page)).toEqual([word])
    const back = goBack(selectTab(onAccount, 'lookUp'))
    expect(back.stacks.lookUp.map(stacked => stacked.page)).toEqual([word])
    expect(back.stacks.account).toHaveLength(1)
    expect(goBack(goBack(back))).toEqual(goBack(back))
  })

  it('gives every page its own key, and does not stack the page already on top', () => {
    const state = openPage(openPage(openPage(startState('lookUp'), word), word), kanji)
    expect(state.stacks.lookUp.map(stacked => stacked.key)).toEqual([0, 1])
  })

  it('goes to a route by choosing its tab, then opening its page there', () => {
    const state = goTo(startState('lookUp'), { tab: 'player', page: kanji })
    expect(state.tab).toBe('player')
    expect(state.stacks.player.map(stacked => stacked.page)).toEqual([kanji])
    expect(goTo(state, {})).toBe(state)
    expect(goTo(state, { page: word }).stacks.player).toHaveLength(2)
  })
})
