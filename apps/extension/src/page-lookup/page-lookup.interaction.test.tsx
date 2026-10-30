import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Settings, settingDefaults } from '../shared/settings'
import {
  changingSettings,
  later,
  pageAids,
  pageLookupOn,
  stopPageLookups
} from '../test/page-lookup'
import { sentence } from '../test/word-cards'

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
  stopPageLookups()
  vi.unstubAllGlobals()
  watching.clear()
  heard = 0
  document.body.replaceChildren()
})

const settingsWith = (changes: Partial<Settings>) =>
  changingSettings({ ...settingDefaults, 'sites.off': [], ...changes })

const lookUpOn = (changes: Partial<Settings>) => pageLookupOn(settingsWith(changes))

describe('the page lookup', () => {
  for (const aid of ['readingAids.furigana', 'readingAids.wordMeanings'] as const) {
    it(`draws nothing and watches nothing once it stops with ${aid} on`, async () => {
      vi.stubGlobal('MutationObserver', WatchedObserver)
      document.body.innerHTML = `<p id="read">${sentence}</p>`
      const { lookup, segment, underlines } = lookUpOn({
        'readingAids.furigana': false,
        [aid]: true
      })
      await vi.waitFor(() => expect(pageAids()).toBeGreaterThan(0))
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
      expect(pageAids()).toBe(0)
    })
  }

  it('reads no page text while Page Text is off, and starts when it turns on, with no reload', async () => {
    document.body.innerHTML = `<p id="read">${sentence}</p>`
    const settings = settingsWith({ 'pages.pageText': false })
    const { segment, underlines } = pageLookupOn(settings)
    await later()
    expect(segment).not.toHaveBeenCalled()
    expect(underlines.draw).not.toHaveBeenCalled()
    expect(pageAids()).toBe(0)
    settings.change({ 'pages.pageText': true })
    await vi.waitFor(() => expect(pageAids()).toBeGreaterThan(0))
    expect(underlines.draw).toHaveBeenCalled()
  })

  it('takes its underlines and reading aids away at once when Page Text turns off, watches nothing, and brings them back when it turns on', async () => {
    vi.stubGlobal('MutationObserver', WatchedObserver)
    document.body.innerHTML = `<p id="read">${sentence}</p>`
    const settings = settingsWith({})
    const { segment, underlines } = pageLookupOn(settings)
    await vi.waitFor(() => expect(pageAids()).toBeGreaterThan(0))
    expect(underlines.draw).toHaveBeenCalled()

    settings.change({ 'pages.pageText': false })
    expect(pageAids()).toBe(0)
    expect(document.getElementById('read')?.textContent).toBe(sentence)
    expect(underlines.stop).toHaveBeenCalled()
    expect(watching.size).toBe(0)
    segment.mockClear()
    underlines.draw.mockClear()
    document.body.insertAdjacentHTML('beforeend', `<p id="added">${sentence}</p>`)
    await later()
    expect(segment).not.toHaveBeenCalled()
    expect(underlines.draw).not.toHaveBeenCalled()

    settings.change({ 'pages.pageText': true })
    await vi.waitFor(() => expect(document.querySelectorAll('#read rt, #added rt')).toHaveLength(4))
    expect(underlines.draw).toHaveBeenCalled()
  })
})
