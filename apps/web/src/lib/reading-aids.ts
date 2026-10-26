export const readingAids = [
  { id: 'furigana', attribute: 'data-furigana', shownByDefault: true },
  { id: 'romaji', attribute: 'data-romaji', shownByDefault: false },
  { id: 'wordMeanings', attribute: 'data-word-meanings', shownByDefault: false },
  { id: 'translations', attribute: 'data-translations', shownByDefault: true }
] as const

export type ReadingAid = (typeof readingAids)[number]['id']

type AidAttribute = 'on' | 'off'

const aidNamed = (id: ReadingAid) => {
  const aid = readingAids.find(candidate => candidate.id === id)
  if (!aid) throw new Error(`Unknown reading aid: ${id}`)
  return aid
}

export const readingAidStorageKey = (id: ReadingAid) => `readingAids.${id}`

export function shownFromStored(id: ReadingAid, stored: string | null): boolean {
  if (stored === 'true') return true
  if (stored === 'false') return false
  return aidNamed(id).shownByDefault
}

export const attributeValue = (shown: boolean): AidAttribute => (shown ? 'on' : 'off')

const storedValue = (shown: boolean) => (shown ? 'true' : 'false')

function storedAid(id: ReadingAid): string | null {
  try {
    return window.localStorage.getItem(readingAidStorageKey(id))
  } catch {
    return null
  }
}

export function readingAidShown(id: ReadingAid): boolean {
  const value = document.documentElement.getAttribute(aidNamed(id).attribute)
  return value === null ? shownFromStored(id, storedAid(id)) : value === 'on'
}

export const readingAidShownByDefault = (id: ReadingAid) => aidNamed(id).shownByDefault

const listeners = new Set<() => void>()

function applied(id: ReadingAid, shown: boolean) {
  document.documentElement.setAttribute(aidNamed(id).attribute, attributeValue(shown))
  for (const listener of listeners) listener()
}

function keep(id: ReadingAid, shown: boolean) {
  try {
    window.localStorage.setItem(readingAidStorageKey(id), storedValue(shown))
  } catch {
    return
  }
}

export function showReadingAid(id: ReadingAid, shown: boolean): void {
  keep(id, shown)
  applied(id, shown)
}

export function onReadingAidsChange(listener: () => void): () => void {
  listeners.add(listener)
  const fromAnotherTab = (event: StorageEvent) => {
    const changed = readingAids.find(aid => event.key === readingAidStorageKey(aid.id))
    if (changed) applied(changed.id, shownFromStored(changed.id, event.newValue))
  }
  window.addEventListener('storage', fromAnotherTab)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', fromAnotherTab)
  }
}

const scriptAids = readingAids.map(aid => [
  readingAidStorageKey(aid.id),
  aid.attribute,
  aid.shownByDefault
])

export const readingAidsScript = `(function(aids){var root=document.documentElement;for(var i=0;i<aids.length;i++){var stored=null;try{stored=localStorage.getItem(aids[i][0])}catch(e){}var shown=stored==="true"||(stored!=="false"&&aids[i][2]);root.setAttribute(aids[i][1],shown?"on":"off")}})(${JSON.stringify(scriptAids)})`
