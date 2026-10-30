import { readsPageText, type Settings } from '../shared/settings'
import type { PopupHost, PopupSettings } from '../word-popup/popup-host'
import { popupSettings } from '../word-popup/popup-settings'
import type { Aids } from './annotate'
import { type GlossLookUp, glossCache } from './glosses'
import { anchorOf, type Found, pageRendering, type Rendering, wordIds } from './rendering'
import { type ScanProblem, type Segment, scanner, type Wait } from './scan'
import type { Underlines } from './underline'
import { japaneseText, leftAloneIn, onScreenFirst } from './walker'

export type PageLookupBrowser = {
  doc: Document
  view: Window
  host: string
  askSettings(): Promise<Settings>
  onSettingsChanged(listener: (settings: Settings) => void): () => void
  segment: Segment
  popupCard(languageReferenceID: string, frequency: readonly string[]): ReturnType<GlossLookUp>
  underlines(): Underlines
  popup(settings: () => PopupSettings): PopupHost
  report(error: unknown): void
  wait: Wait
}

export type PageLookup = { stop(): void }

export const decidedEvent = 'zenbujapanese-page-text'

const aidsOf = (settings: Settings): Aids => ({
  furigana: settings['readingAids.furigana'],
  romaji: settings['readingAids.romaji'],
  meanings: settings['readingAids.wordMeanings']
})

const sameAids = (left: Aids, right: Aids) =>
  left.furigana === right.furigana &&
  left.romaji === right.romaji &&
  left.meanings === right.meanings

const followsLink = (event: MouseEvent) =>
  event.button !== 0 ||
  event.detail !== 1 ||
  event.metaKey ||
  event.ctrlKey ||
  event.shiftKey ||
  event.altKey

type Running = {
  rendering: Rendering
  underlines: Underlines
  observer: MutationObserver
  stop(): void
}

export function startPageLookup(browser: PageLookupBrowser): PageLookup {
  const { doc, view } = browser
  let settings: Settings | null = null
  let running: Running | null = null
  let heard = false
  const reported = new Set<ScanProblem>()
  const glosses = glossCache(id => browser.popupCard(id, []))
  const popup = browser.popup(() => popupSettings(settings as Settings, browser))

  const problem = (found: ScanProblem) => {
    if (reported.has(found)) return
    reported.add(found)
    browser.report(new Error(`Page lookup: ${found}`))
  }

  const withGlosses = (rendering: Rendering, ids: readonly string[], redraw: () => void) => {
    if (!settings?.['readingAids.wordMeanings']) return
    const missing = ids.filter(id => !glosses.known.has(id))
    if (missing.length === 0) return
    glosses.fetch(missing).then(() => {
      if (running?.rendering === rendering) redraw()
    })
  }

  function start(): Running {
    let live = true
    const observe = () => {
      if (live)
        observer.observe(doc.documentElement, {
          childList: true,
          characterData: true,
          subtree: true
        })
    }
    const quiet = (change: () => void) => {
      const pending = observer.takeRecords()
      observer.disconnect()
      try {
        change()
      } finally {
        observe()
        if (pending.length > 0) queueMicrotask(() => changed(pending))
      }
    }
    const underlines = browser.underlines()
    const rendering = pageRendering({
      doc,
      view,
      underlines,
      aids: () => aidsOf(settings as Settings),
      glosses: glosses.known,
      quiet
    })
    const scan = scanner({
      segment: browser.segment,
      problem,
      wait: browser.wait,
      found(node: Text, found: Found) {
        rendering.add(node, found)
        withGlosses(rendering, wordIds(found.tokens), () => {
          if (rendering.has(node)) rendering.add(node, found)
        })
      }
    })
    const changed = (records: readonly MutationRecord[]) => {
      if (running?.rendering !== rendering) return
      const skips = leftAloneIn(view)
      const found: Text[] = []
      let removed = false
      for (const record of records) {
        if (record.type === 'characterData') {
          const node = record.target as Text
          if (rendering.has(node)) rendering.forget(node, false)
          found.push(...japaneseText(node, skips))
          continue
        }
        removed ||= record.removedNodes.length > 0
        for (const added of record.addedNodes) found.push(...japaneseText(added, skips))
      }
      if (removed) {
        for (const node of rendering.nodes()) if (!node.isConnected) rendering.forget(node, false)
      }
      scan.add(
        found.filter(node => !rendering.has(node)),
        'first'
      )
    }
    const observer = new MutationObserver(changed)
    observe()
    const onClick = (event: MouseEvent) => {
      if (followsLink(event) || popup.holds(event)) return
      const selection = view.getSelection()
      if (selection && !selection.isCollapsed) return
      const piece = rendering.wordAt(event.clientX, event.clientY)
      if (!piece) return
      event.preventDefault()
      event.stopPropagation()
      popup.open({ text: piece.token.text, ids: piece.token.ids, anchor: anchorOf(doc, piece) })
    }
    view.addEventListener('click', onClick, true)
    scan.add(onScreenFirst(japaneseText(doc.body ?? doc.documentElement, leftAloneIn(view)), view))
    return {
      rendering,
      underlines,
      observer,
      stop() {
        live = false
        view.removeEventListener('click', onClick, true)
        observer.disconnect()
        scan.stop()
        popup.close()
        rendering.clear()
        underlines.stop()
      }
    }
  }

  const show = (next: Settings) => {
    const before = settings
    settings = next
    if (!readsPageText(browser.host, next)) {
      running?.stop()
      running = null
      return
    }
    if (!running) {
      running = start()
      return
    }
    if (before && sameAids(aidsOf(before), aidsOf(next))) return
    const { rendering } = running
    rendering.redraw()
    withGlosses(rendering, rendering.wordIds(), () => rendering.redraw())
  }

  const stopListening = browser.onSettingsChanged(next => {
    heard = true
    show(next)
  })
  const answerDecided = (event: Event) => {
    if (settings) event.preventDefault()
  }
  doc.addEventListener(decidedEvent, answerDecided)
  browser.askSettings().then(
    next => {
      if (!heard) show(next)
    },
    error => browser.report(error)
  )

  return {
    stop() {
      running?.stop()
      running = null
      stopListening()
      doc.removeEventListener(decidedEvent, answerDecided)
    }
  }
}
