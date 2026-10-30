import { vi } from 'vitest'
import { type PageLookup, startPageLookup } from '../page-lookup/page-lookup'
import type { PageSettings, Settings } from '../shared/settings'
import { savingStandIn } from './saving-stand-in'
import { popupAnswer, sentenceAnswer } from './word-cards'

export const later = () => new Promise<void>(done => setTimeout(done, 20))

const running = new Set<PageLookup>()

export function stopPageLookups() {
  for (const lookup of running) lookup.stop()
  running.clear()
}

export function pageLookupOn(settings: PageSettings, host = 'example.test') {
  const segment = vi.fn(async () => sentenceAnswer)
  const underlines = { draw: vi.fn(), erase: vi.fn(), stop: vi.fn() }
  const lookup = startPageLookup({
    doc: document,
    view: window,
    host,
    askSettings: () => settings.ask(),
    onSettingsChanged: listener => settings.onChanged(listener),
    segment,
    popupCard: async id => popupAnswer(id),
    saving: savingStandIn().port,
    underlines: () => underlines,
    popup: () => ({ open: vi.fn(), close: vi.fn(), holds: () => false }),
    report: error => {
      throw error
    },
    wait: later
  })
  running.add(lookup)
  return { lookup, segment, underlines }
}

export function changingSettings(first: Settings) {
  const listeners = new Set<(settings: Settings) => void>()
  let current = first
  return {
    ask: async () => current,
    onChanged(listener: (settings: Settings) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    change(changes: Partial<Settings>) {
      current = { ...current, ...changes }
      for (const listener of [...listeners]) listener(current)
    }
  }
}

export const pageAids = () => document.querySelectorAll('rt, [data-zenbu-aid]').length
