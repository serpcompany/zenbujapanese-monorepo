const storageKey = 'zenbu-signed-in'
const listeners = new Set<() => void>()

export function seemsSignedIn(): boolean {
  try {
    return window.localStorage.getItem(storageKey) === 'yes'
  } catch {
    return false
  }
}

export function rememberSignedIn(signedIn: boolean): void {
  try {
    if (signedIn) window.localStorage.setItem(storageKey, 'yes')
    else window.localStorage.removeItem(storageKey)
  } catch {
    return
  } finally {
    for (const listener of listeners) listener()
  }
}

export function onSignedInChange(listener: () => void): () => void {
  listeners.add(listener)
  const fromAnotherTab = (event: StorageEvent) => {
    if (event.key === storageKey) listener()
  }
  window.addEventListener('storage', fromAnotherTab)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', fromAnotherTab)
  }
}
