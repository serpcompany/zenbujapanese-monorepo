import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Settings, settingDefaults } from '../shared/settings'
import { savingStandIn } from '../test/saving-stand-in'
import { popupAnswer, sentence, sentenceAnswer } from '../test/word-cards'
import { startPageLookup } from './page-lookup'

const watching = new Set<MutationObserver>()

let heard = 0

class WatchedObserver extends MutationObserver {
  constructor(callback: MutationCallback) {
    super((records, observer) => {
      heard += 1
      callback(records, observer)
    })
  }
  override observe(target: Node, options?: MutationObserverInit) {
    watching.add(this)
    super.observe(target, options)
  }
  override disconnect() {
    watching.delete(this)
    super.disconnect()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  watching.clear()
  heard = 0
  document.body.replaceChildren()
})

const later = () => new Promise<void>(done => setTimeout(done, 20))

function lookUpOn(changes: Partial<Settings>) {
  const settings: Settings = { ...settingDefaults, 'sites.off': [], ...changes }
  const segment = vi.fn(async () => sentenceAnswer)
  const underlines = { draw: vi.fn(), erase: vi.fn(), stop: vi.fn() }
  const lookup = startPageLookup({
    doc: document,
    view: window,
    host: 'example.test',
    askSettings: async () => settings,
    onSettingsChanged: () => () => {},
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
  return { lookup, segment, underlines }
}

describe('the page lookup', () => {
  for (const aid of ['readingAids.furigana', 'readingAids.wordMeanings'] as const) {
    it(`draws nothing and watches nothing once it stops with ${aid} on`, async () => {
      vi.stubGlobal('MutationObserver', WatchedObserver)
      document.body.innerHTML = `<p id="read">${sentence}</p>`
      const { lookup, segment, underlines } = lookUpOn({
        'readingAids.furigana': false,
        [aid]: true
      })
      await vi.waitFor(() =>
        expect(document.querySelectorAll('rt, [data-zenbu-aid]').length).toBeGreaterThan(0)
      )
      lookup.stop()
      expect(document.getElementById('read')?.textContent).toBe(sentence)
      expect(watching.size).toBe(0)
      segment.mockClear()
      underlines.draw.mockClear()
      const before = heard
      document.body.insertAdjacentHTML('beforeend', `<p id="added">${sentence}</p>`)
      await later()
      expect(heard).toBe(before)
      expect(segment).not.toHaveBeenCalled()
      expect(underlines.draw).not.toHaveBeenCalled()
      expect(document.querySelector('rt, [data-zenbu-aid]')).toBeNull()
    })
  }
})
