import { normalizeQuery } from '@zenbu/dictionary-core/search/query'
import { syncedService } from './learner-items'

const askedKey = 'search.asked'

export function askForSearch(typed: string): void {
  if (!syncedService()) return
  try {
    window.sessionStorage.setItem(askedKey, normalizeQuery(typed))
  } catch {
    return
  }
}

export function takeAskedSearch(): string | null {
  try {
    const asked = window.sessionStorage.getItem(askedKey)
    window.sessionStorage.removeItem(askedKey)
    return asked
  } catch {
    return null
  }
}
