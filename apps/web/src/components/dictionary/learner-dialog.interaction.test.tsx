import { act } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { getDictionary } from '@/lib/i18n/dictionary'
import { answer, stubAccountService } from '@/test/account-page'
import {
  accountPagesOpen,
  dialog,
  forgetAll,
  kanji,
  labels,
  learnerText,
  loaded,
  named,
  openFromTheMenu,
  press,
  renderActions,
  renderPrompt,
  signedInHere,
  standingIn,
  syncedText,
  word
} from '@/test/learner-actions'
import { sessionAnswer, signedIn } from '@/test/signed-in-account'

vi.hoisted(() => vi.stubEnv('ZENBU_ACCOUNT_PAGES', 'open'))
afterEach(forgetAll)

const isKnown = `${word.headword} is marked Known.`
const notKnown = `${word.headword} isn’t marked Known.`

describe('signed in with a subscription, Known', () => {
  beforeEach(() => {
    accountPagesOpen()
    signedInHere()
  })

  test('Mark as Known marks the word Known, and Mark as Unknown clears it', async () => {
    const standIn = standingIn()
    renderActions()
    await openFromTheMenu('Mark as Known')
    await loaded(notKnown)
    expect(standIn.reads).toEqual([`knownWord?limit=500&item=${word.id}`])
    await press('button', 'Mark as Known')
    await loaded(isKnown)
    expect(standIn.dataOf('knownWord', word.id)).toEqual({
      itemId: word.id,
      headword: word.headword,
      reading: word.reading,
      known: true
    })
    await press('button', 'Mark as Unknown')
    await loaded(notKnown)
    expect(standIn.dataOf('knownWord', word.id)).toMatchObject({ known: false })
    expect(standIn.sent.map(each => [each.operation, each.baseVersion])).toEqual([
      ['mark', 0],
      ['clear', 1]
    ])
  })

  test('a kanji is marked Known as itself, with the reading the app saves it with', async () => {
    const standIn = standingIn()
    renderActions(kanji)
    await openFromTheMenu('Mark as Known', kanji)
    await press('button', 'Mark as Known')
    await loaded('要 is marked Known.')
    expect(standIn.dataOf('knownWord', 'kanji:要')).toEqual({
      itemId: 'kanji:要',
      headword: '要',
      reading: 'ヨウ',
      known: true
    })
  })

  test("a change made elsewhere first shows the account's copy", async () => {
    const standIn = standingIn()
    standIn.holds('knownWord', word.id, { itemId: word.id, ...labels, known: true })
    renderActions()
    await openFromTheMenu('Mark as Known')
    await loaded(isKnown)
    standIn.holds('knownWord', word.id, { itemId: word.id, ...labels, known: true }, 2)
    await press('button', 'Mark as Unknown')
    await loaded(syncedText.changedElsewhere)
    expect(dialog().textContent).toContain(isKnown)
    expect(standIn.dataOf('knownWord', word.id)).toMatchObject({ known: true })
  })

  test("each change disables the dialog's controls while it runs", async () => {
    standingIn()
    const answered = Promise.withResolvers<void>()
    const service = globalThis.fetch
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      if (init.method === 'POST') await answered.promise
      return service(url, init)
    })
    renderActions()
    await openFromTheMenu('Mark as Known')
    await loaded(notKnown)
    await press('button', 'Mark as Known')
    expect(named<HTMLButtonElement>('button', 'Mark as Known').disabled).toBe(true)
    await act(async () => answered.resolve())
    await loaded(isKnown)
    expect(named<HTMLButtonElement>('button', 'Mark as Unknown').disabled).toBe(false)
  })
})

describe('signed in, but not shown', () => {
  beforeEach(() => {
    accountPagesOpen()
    signedInHere()
  })

  test('without a subscription, the dialog points to the subscription on the account page', async () => {
    const standIn = standingIn()
    standIn.subscribed = false
    renderPrompt('lists')
    await press('button', 'Add to List')
    await loaded(syncedText.needsSubscription)
    expect(named('a', syncedText.seeSubscription).getAttribute('href')).toBe(
      '/account/#subscription'
    )
    expect(standIn.sent).toEqual([])
  })

  test('signed out at the account, the dialog says so with Sign in, and this browser forgets it was signed in', async () => {
    standingIn(stubAccountService({ 'GET /v1/auth/get-session': answer(null) }))
    renderPrompt('notes')
    await press('button', 'Add Note')
    await loaded(learnerText.synced.signedOut)
    expect(named('a', 'Sign in').getAttribute('href')).toBe('/login/')
    expect(window.localStorage.getItem('zenbu-signed-in')).toBeNull()
  })

  test('a failure says what went wrong, and Try again loads it', async () => {
    const offline = () => Promise.reject(new TypeError('offline'))
    const standIn = standingIn(
      signedIn({
        more: { 'GET /v1/auth/get-session': [offline, sessionAnswer('u1', 'bare', 1)] }
      })
    )
    renderActions()
    await openFromTheMenu('Mark as Known')
    await loaded(getDictionary('en').account.messages.offline)
    await press('button', 'Try again')
    await loaded(notKnown)
    expect(standIn.reads).toHaveLength(1)
  })
})

describe('the get-the-app prompt', () => {
  test('signed out in this browser, the actions open the prompt, with Sign in, and ask the account nothing', async () => {
    accountPagesOpen()
    const calls = stubAccountService({})
    renderPrompt('lists')
    await press('button', 'Add to List')
    expect(dialog().textContent).toContain(learnerText.inApp.addToList)
    expect(dialog().textContent).toContain(
      'With a subscription, you can do the same on this website once you’re signed in. Photos stay in the app.'
    )
    expect(named('a', 'Sign in').getAttribute('href')).toBe('/login/')
    expect(named('a', 'Get the app')).toBeTruthy()
    expect(calls.calls).toEqual([])
  })

  test('Add Photo keeps the prompt for a learner signed in here, without Sign in', async () => {
    accountPagesOpen()
    signedInHere()
    renderActions()
    await openFromTheMenu('Add Photo')
    expect(dialog().textContent).toContain(learnerText.inApp.addPhoto)
    expect(dialog().textContent).not.toContain('Sign in')
  })

  test("where the site's account pages are closed, the prompt offers no Sign in", async () => {
    accountPagesOpen(false)
    signedInHere()
    renderPrompt('notes')
    await press('button', 'Add Note')
    expect(dialog().textContent).toContain(learnerText.inApp.addNote)
    expect(dialog().textContent).not.toContain('Sign in')
  })
})
