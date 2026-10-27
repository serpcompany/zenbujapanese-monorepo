import { act } from 'react'
import { vi } from 'vitest'
import { LearnerPrompt } from '@/components/dictionary/learner-prompt'
import { SavedItemActions } from '@/components/dictionary/saved-item-actions'
import { syncedTextIn } from '@/lib/account/learner-text'
import { kanjiItem, type SavedItem } from '@/lib/account/saved-item'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { apiUrl, render, settle, shows, unmount } from './account-page'
import { fixtureKanji, unlinkedKanjiDetails } from './kanji-details'
import { signedIn } from './signed-in-account'
import { withSynced } from './synced-service'
import { SyncedStandIn } from './synced-stand-in'

export const learnerText = getDictionary('en').learner
export const syncedText = getDictionary('en').account.synced

export const word: SavedItem = {
  id: 'd12d09f1107aef0f7d43b54b62f0b7e1',
  headword: '要る',
  reading: 'いる'
}

export const labels = { headword: word.headword, reading: word.reading }

export const kanji = kanjiItem(unlinkedKanjiDetails(fixtureKanji('要')))

export const page = () => document.body

export function accountPagesOpen(open = true) {
  vi.stubEnv('ZENBU_ACCOUNT_PAGES', open ? 'open' : 'closed')
  vi.stubEnv('ZENBU_ACCOUNT_SERVICE', open ? apiUrl : '')
}

export function signedInHere() {
  window.localStorage.setItem('zenbu-signed-in', 'yes')
}

export function standingIn(stubbed = signedIn()) {
  const standIn = new SyncedStandIn()
  withSynced(standIn, stubbed)
  return standIn
}

export function forgetAll() {
  unmount()
  vi.unstubAllEnvs()
  window.localStorage.clear()
}

const props = (item: SavedItem, locale: Locale) => ({
  item,
  locale,
  text: getDictionary(locale).learner,
  account: syncedTextIn(locale)
})

export function renderPrompt(kind: 'lists' | 'notes', item = word, locale: Locale = 'en') {
  return render(<LearnerPrompt kind={kind} {...props(item, locale)} />)
}

export function renderActions(item = word, locale: Locale = 'en') {
  return render(
    <SavedItemActions
      title={item.headword}
      shareText={item.headword}
      name={item.headword}
      {...props(item, locale)}
    />
  )
}

export function dialog(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[role="dialog"]')
  if (!found) throw new Error(`No dialog is open\n\nShown: ${document.body.textContent}`)
  return found
}

export function named<E extends HTMLElement>(role: string, name: string): E {
  const found = [...document.querySelectorAll<E>(`[role="${role}"], ${role}`)].find(
    element =>
      element.getAttribute('aria-label') === name ||
      element.textContent?.trim() === name ||
      document.querySelector(`label[for="${element.id}"]`)?.textContent === name ||
      document.getElementById(element.getAttribute('aria-labelledby') ?? '')?.textContent === name
  )
  if (!found) throw new Error(`No ${role} named ${name}\n\nShown: ${document.body.textContent}`)
  return found
}

export async function press(role: string, name: string) {
  await act(async () => named(role, name).click())
  await settle()
}

export async function openFromTheMenu(action: string, item = word) {
  await press('button', `More actions for ${item.headword}`)
  await press('menuitem', action)
}

export async function typeInto(field: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const prototype = Object.getPrototypeOf(field)
  await act(async () => {
    Reflect.set(prototype, 'value', value, field)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

export const loaded = (text: string) => shows(page(), text)
