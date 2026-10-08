const storageKey = 'zenbu-signed-in'
const initialsKey = 'zenbu-initials'
const listeners = new Set<() => void>()

function stored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function seemsSignedIn(): boolean {
  return stored(storageKey) === 'yes'
}

const mostInitials = 2

export function signedInInitials(): string | null {
  if (!seemsSignedIn()) return null
  const initials = stored(initialsKey) ?? ''
  return Array.from(initials).length <= mostInitials ? initials : ''
}

export function initialsOf(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (words.length > 0 ? words.slice(0, 2) : [email])
    .map(word => Array.from(word)[0] ?? '')
    .join('')
    .toLocaleUpperCase()
}

export function rememberSignedIn(signedIn: boolean, initials?: string): void {
  try {
    if (signedIn) {
      window.localStorage.setItem(storageKey, 'yes')
      if (initials === undefined) window.localStorage.removeItem(initialsKey)
      else window.localStorage.setItem(initialsKey, initials)
    } else {
      window.localStorage.removeItem(storageKey)
      window.localStorage.removeItem(initialsKey)
    }
  } catch {
    return
  } finally {
    for (const listener of listeners) listener()
  }
}

export function onSignedInChange(listener: () => void): () => void {
  listeners.add(listener)
  const fromAnotherTab = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === initialsKey) listener()
  }
  window.addEventListener('storage', fromAnotherTab)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', fromAnotherTab)
  }
}
