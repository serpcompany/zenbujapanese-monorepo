import { afterEach, describe, expect, it, vi } from 'vitest'
import { goBack, goTo, openPage, selectTab, startState } from './navigation'
import { isPanelRoute, type PanelPage, routeForWindow } from './route'

afterEach(() => vi.unstubAllEnvs())

const testPage: PanelPage = { page: 'test', text: '猫' }
const imageSearch: PanelPage = { page: 'image-search' }

describe('isPanelRoute', () => {
  it('takes a tab, a page, both, or neither', () => {
    expect(isPanelRoute({})).toBe(true)
    expect(isPanelRoute({ tab: 'player' })).toBe(true)
    expect(isPanelRoute({ page: testPage })).toBe(true)
    expect(isPanelRoute({ tab: 'account', page: { page: 'image-search' } })).toBe(true)
    expect(isPanelRoute({ page: { page: 'test', text: '猫' } })).toBe(true)
    expect(isPanelRoute({ tab: 'translate', page: { page: 'image-search' } })).toBe(true)
  })

  it('refuses a tab or page the panel does not have, or a page with the wrong fields', () => {
    expect(isPanelRoute(null)).toBe(false)
    expect(isPanelRoute({ tab: 'history' })).toBe(false)
    expect(isPanelRoute({ tab: 'video' })).toBe(false)
    expect(isPanelRoute({ tab: 'lookUp' })).toBe(false)
    expect(isPanelRoute({ page: { page: 'settings' } })).toBe(false)
    expect(isPanelRoute({ page: { page: 'toString' } })).toBe(false)
    expect(isPanelRoute({ page: { page: 'test', text: 7 } })).toBe(false)
    expect(isPanelRoute({ page: { page: 'word', entSeq: 1358280 } })).toBe(false)
    expect(isPanelRoute({ page: { page: 'kanji', character: '猫' } })).toBe(false)
    expect(isPanelRoute({ page: { page: 'form', form: '食べた' } })).toBe(false)
  })

  it('refuses the test page outside the test build', () => {
    vi.stubEnv('MODE', 'production')
    expect(isPanelRoute({ page: { page: 'test', text: '猫' } })).toBe(false)
  })
})

describe('routeForWindow', () => {
  const move = { target: 'side-panel', windowId: 7, route: { page: imageSearch } }

  it("takes a move for the panel's own window", () => {
    expect(routeForWindow(7, move)).toEqual({ page: imageSearch })
  })

  it("ignores another window's move, another target, and a broken route", () => {
    expect(routeForWindow(8, move)).toBeNull()
    expect(routeForWindow(7, { ...move, target: 'offscreen' })).toBeNull()
    expect(routeForWindow(7, { ...move, route: { tab: 'history' } })).toBeNull()
    expect(routeForWindow(7, 'side-panel')).toBeNull()
  })
})

describe('navigation', () => {
  it('keeps a stack of pages for each tab, and Back pops one page of the current tab', () => {
    const onTranslate = openPage(openPage(startState('translate'), testPage), imageSearch)
    const onAccount = openPage(selectTab(onTranslate, 'account'), testPage)
    expect(onAccount.stacks.translate.map(stacked => stacked.page)).toEqual([testPage, imageSearch])
    expect(onAccount.stacks.account.map(stacked => stacked.page)).toEqual([testPage])
    const back = goBack(selectTab(onAccount, 'translate'))
    expect(back.stacks.translate.map(stacked => stacked.page)).toEqual([testPage])
    expect(back.stacks.account).toHaveLength(1)
    expect(goBack(goBack(back))).toEqual(goBack(back))
  })

  it('gives every page its own key, and does not stack the page already on top', () => {
    const state = openPage(
      openPage(openPage(startState('translate'), testPage), testPage),
      imageSearch
    )
    expect(state.stacks.translate.map(stacked => stacked.key)).toEqual([0, 1])
  })

  it('goes to a route by choosing its tab, then opening its page there', () => {
    const state = goTo(startState('translate'), { tab: 'player', page: imageSearch })
    expect(state.tab).toBe('player')
    expect(state.stacks.player.map(stacked => stacked.page)).toEqual([imageSearch])
    expect(goTo(state, {})).toBe(state)
    expect(goTo(state, { page: testPage }).stacks.player).toHaveLength(2)
  })
})
