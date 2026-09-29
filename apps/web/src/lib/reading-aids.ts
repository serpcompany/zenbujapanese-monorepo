import {
  type ReadingAid,
  type ReadingAidSettings,
  readingAidDefaults
} from '@/lib/dictionary/detail/reading-aids'

// Where the website keeps Reading Aids until accounts exist (#468): the browser's localStorage, as
// the app keeps them on the device. The root layout's inline script (`readingAidsScript`) reads
// them before the page paints and sets one attribute per aid on <html>, "on" or "off", which
// globals.css's variants show or hide each aid's text by. The page itself renders the defaults.

export const readingAidStorageKey = 'zenbu.reading-aids.v1'

/** The attribute on <html> that carries each aid's setting. */
export const readingAidAttributes: Record<ReadingAid, string> = {
  furigana: 'data-furigana',
  romaji: 'data-romaji',
  wordMeanings: 'data-word-meanings',
  translations: 'data-translations'
}

/** Stored settings, with the app's default for anything missing or unreadable. */
export function parseReadingAids(raw: string | null): ReadingAidSettings {
  let stored: unknown = null
  try {
    stored = raw === null ? null : JSON.parse(raw)
  } catch {
    stored = null
  }
  const values =
    stored !== null && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}
  return Object.fromEntries(
    (Object.keys(readingAidDefaults) as ReadingAid[]).map(aid => [
      aid,
      typeof values[aid] === 'boolean' ? values[aid] : readingAidDefaults[aid]
    ])
  ) as ReadingAidSettings
}

/** Sets each aid's attribute on `root` (<html>). */
export function applyReadingAids(root: Element, settings: ReadingAidSettings) {
  for (const aid of Object.keys(readingAidAttributes) as ReadingAid[]) {
    root.setAttribute(readingAidAttributes[aid], settings[aid] ? 'on' : 'off')
  }
}

/**
 * The root layout's inline script, run before the body paints: `parseReadingAids` and
 * `applyReadingAids` on <html>, self-contained. Blocked storage leaves the defaults.
 */
export const readingAidsScript = `(function(){var d=${JSON.stringify(
  readingAidDefaults
)},a=${JSON.stringify(readingAidAttributes)},s={};try{s=JSON.parse(localStorage.getItem(${JSON.stringify(
  readingAidStorageKey
)}))||{}}catch(e){}if(typeof s!=="object")s={};var r=document.documentElement;for(var k in a){r.setAttribute(a[k],(typeof s[k]==="boolean"?s[k]:d[k])?"on":"off")}})()`
