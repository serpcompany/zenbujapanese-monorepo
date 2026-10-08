import { type AccountSession, isFields } from './answers'

const storageKey = 'zenbu-confirming'

interface Confirming {
  userId: string
  token: string
}

export function rememberConfirming({ userId, token }: AccountSession): void {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify({ userId, token }))
  } catch {
    return
  }
}

export function confirmingFrom(): Confirming | null {
  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(storageKey) ?? 'null')
    return isFields(stored) && typeof stored.userId === 'string' && typeof stored.token === 'string'
      ? { userId: stored.userId, token: stored.token }
      : null
  } catch {
    return null
  }
}

export function forgetConfirming(): void {
  try {
    window.sessionStorage.removeItem(storageKey)
  } catch {
    return
  }
}
