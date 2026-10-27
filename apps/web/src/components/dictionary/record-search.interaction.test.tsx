import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { askForSearch } from '@/lib/account/asked-search'
import { render } from '@/test/account-page'
import { accountPagesOpen, forgetAll, signedInHere, standingIn } from '@/test/learner-actions'
import { RecordSearch } from './record-search'

afterEach(() => {
  forgetAll()
  window.sessionStorage.clear()
})

const idOf = (searchKey: string, query: string) =>
  createHmac('sha256', Buffer.from(searchKey, 'hex')).update(query.normalize('NFC')).digest('hex')

const searchPage = (query: string, refinement: string | null = null) =>
  render(<RecordSearch query={query} refinement={refinement} locale="en" />)

function asASubscriber() {
  accountPagesOpen()
  signedInHere()
  return standingIn()
}

describe('a search the learner asks for, on the website', () => {
  test("goes into a subscriber's Recent searches after the page draws, under its ID from the account's key", async () => {
    const standIn = asASubscriber()
    askForSearch('  ねこ ')
    const page = searchPage('ねこ')
    expect(page.innerHTML).toBe('')
    await vi.waitFor(() => expect(standIn.sent).toHaveLength(1))
    expect(standIn.syncsAsked[0]).toEqual({ limit: 1 })
    expect(standIn.sent[0]).toMatchObject({
      entity: 'recentSearch',
      operation: 'search',
      entityId: idOf(standIn.searchKey, 'ねこ'),
      baseVersion: 0,
      fields: { query: 'ねこ' }
    })
    expect(Date.parse(String(standIn.sent[0]?.fields?.searchedAt))).not.toBeNaN()
    expect(standIn.dataOf('recentSearch', idOf(standIn.searchKey, 'ねこ'))).toMatchObject({
      query: 'ねこ'
    })
  })

  test('searched again after another device removed it, it comes back', async () => {
    const standIn = asASubscriber()
    const id = idOf(standIn.searchKey, '猫')
    standIn.holds('recentSearch', id, null, 2)
    askForSearch('猫')
    searchPage('猫')
    await vi.waitFor(() => expect(standIn.sent).toHaveLength(2))
    expect(standIn.sent.map(each => each.baseVersion)).toEqual([0, 2])
    expect(standIn.dataOf('recentSearch', id)).toMatchObject({ query: '猫' })
  })

  test('a reading refinement picked on the page is asked for, and no other link there is', () => {
    asASubscriber()
    const page = searchPage('要る', 'いる')
    const linkIn = (section: string) => {
      const link = document.createElement('a')
      link.href = '/dictionary/search/%E3%81%84%E3%82%8B/'
      link.addEventListener('click', event => event.preventDefault())
      const card = document.createElement('div')
      card.dataset.section = section
      card.appendChild(link)
      page.appendChild(card)
      return link
    }
    linkIn('results').click()
    expect(window.sessionStorage.getItem('search.asked')).toBeNull()
    linkIn('readingRefinement').click()
    expect(window.sessionStorage.getItem('search.asked')).toBe('いる')
  })

  test('a search page reached any other way, as from a link or by going back, sends nothing', async () => {
    const standIn = asASubscriber()
    askForSearch('犬')
    searchPage('猫')
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(standIn.syncsAsked).toEqual([])
    expect(window.sessionStorage.length).toBe(0)
  })

  test('without a subscription, the search goes nowhere: only the account is asked for its key', async () => {
    const standIn = asASubscriber()
    standIn.subscribed = false
    askForSearch('猫')
    searchPage('猫')
    await vi.waitFor(() => expect(standIn.syncsAsked).toHaveLength(1))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(standIn.syncsAsked).toEqual([{ limit: 1 }])
    expect(standIn.sent).toEqual([])
  })

  test('signed out, nothing is kept or sent', async () => {
    accountPagesOpen()
    const standIn = standingIn()
    askForSearch('猫')
    expect(window.sessionStorage.length).toBe(0)
    searchPage('猫')
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(standIn.syncsAsked).toEqual([])
  })
})
