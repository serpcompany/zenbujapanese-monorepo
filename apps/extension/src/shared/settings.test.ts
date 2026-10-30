import { describe, expect, it } from 'vitest'
import { answerSettings, tellOpenTabs } from '../service-worker/settings'
import { extensionId, fakeChrome } from '../test/fake-chrome'
import {
  askSettings,
  askToWriteSettings,
  captionPlaceKeys,
  captionPlacesReset,
  captionsMoved,
  isZenbuOn,
  onSettingsChanged,
  readSettings,
  type Settings,
  settingDefaults,
  settingsChanged,
  settingsFrom,
  settingsRequest,
  sitesOffWith,
  watchSettings,
  writeSettings
} from './settings'

const pages = `chrome-extension://${extensionId}`

const youtube = 'zenbu.tubelex.youtube.ja.unidic-3.1'
const jlpt = 'zenbu.jlpt.waller.levels'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

describe('settings', () => {
  it("starts from the app's defaults, with crash reports on and both frequency dictionaries chosen", async () => {
    const { chrome } = fakeChrome()
    const settings = await readSettings(chrome.storage.local)
    expect(settings).toEqual(settingDefaults)
    expect(settings['crashReports.send']).toBe(true)
    expect(settings['frequencyDictionaries.chosen']).toEqual([jlpt, youtube])
    expect(settings['sites.off']).toEqual([])
  })

  it('keeps a stored value only when it is the kind the default is', () => {
    const settings = settingsFrom({
      'readingAids.romaji': true,
      'readingAids.furigana': 'yes',
      'sites.off': ['example.com', 3],
      'frequencyDictionaries.chosen': [youtube],
      unknown: true
    })
    expect(settings['readingAids.romaji']).toBe(true)
    expect(settings['readingAids.furigana']).toBe(true)
    expect(settings['sites.off']).toEqual([])
    expect(settings['frequencyDictionaries.chosen']).toEqual([youtube])
    expect(settings).not.toHaveProperty('unknown')
  })

  it('keeps the caption’s place and its English’s, each only as two shares, and none by default', () => {
    for (const key of captionPlaceKeys) {
      const place = (stored: unknown) => settingsFrom({ [key]: stored })
      expect(settingDefaults[key]).toBeNull()
      expect(place({ x: 0, y: 1 })[key]).toEqual({ x: 0, y: 1 })
      for (const stored of [
        { x: 0.5 },
        { x: 0.5, y: 1.5 },
        { x: '0.5', y: 0 },
        [0.5, 0.5],
        0.5,
        null
      ])
        expect(place(stored)[key]).toBeNull()
    }
  })

  it('says the caption has moved while either box has a place, and Reset puts both back', () => {
    const moved = (places: Partial<Settings>) => captionsMoved({ ...settingDefaults, ...places })
    expect(moved({})).toBe(false)
    expect(moved({ 'videos.captionPlace': { x: 0.2, y: 0.1 } })).toBe(true)
    expect(moved({ 'videos.translationPlace': { x: 0.2, y: 0.1 } })).toBe(true)
    expect(
      moved({
        'videos.captionPlace': { x: 0.2, y: 0.1 },
        'videos.translationPlace': { x: 0.8, y: 0.9 },
        ...captionPlacesReset
      })
    ).toBe(false)
  })

  it('writes one key per setting and reads them back', async () => {
    const { chrome, items } = fakeChrome()
    await writeSettings(
      { 'readingAids.romaji': true, 'sites.off': ['example.com'] },
      chrome.storage.local
    )
    expect(items).toEqual({ 'readingAids.romaji': true, 'sites.off': ['example.com'] })
    const settings = await readSettings(chrome.storage.local)
    expect(settings['readingAids.romaji']).toBe(true)
    expect(settings['sites.off']).toEqual(['example.com'])
  })

  it('tells a watcher when a setting changes, not when another key does, and stops when asked', async () => {
    const { chrome } = fakeChrome()
    const heard: Settings[] = []
    const stop = watchSettings(settings => heard.push(settings), chrome.storage.local)
    await chrome.storage.local.set({ 'errorReports.lastSent': 1 })
    await tick()
    expect(heard).toEqual([])
    await writeSettings({ 'readingAids.wordMeanings': true }, chrome.storage.local)
    await tick()
    expect(heard.map(settings => settings['readingAids.wordMeanings'])).toEqual([true])
    stop()
    await writeSettings({ 'readingAids.wordMeanings': false }, chrome.storage.local)
    await tick()
    expect(heard).toHaveLength(1)
  })

  it('turns a site off and on by its host, leaving the other sites', () => {
    const settings = { ...settingDefaults, 'sites.off': ['a.example'] }
    const off = sitesOffWith('b.example', false, settings)
    expect(off).toEqual(['a.example', 'b.example'])
    expect(isZenbuOn('b.example', { ...settings, 'sites.off': off })).toBe(false)
    expect(sitesOffWith('a.example', true, settings)).toEqual([])
  })
})

function settingsChannel() {
  const { chrome } = fakeChrome()
  const store = chrome.storage.local
  chrome.runtime.onMessage.addListener(
    answerSettings(
      pages,
      () => readSettings(store),
      changes => writeSettings(changes, store)
    )
  )
  return { runtime: chrome.runtime, store }
}

describe('the settings channel', () => {
  it("answers a content script's ask with the stored settings", async () => {
    const { chrome } = fakeChrome()
    await writeSettings({ 'readingAids.romaji': true }, chrome.storage.local)
    chrome.runtime.onMessage.addListener(
      answerSettings(pages, () => readSettings(chrome.storage.local))
    )
    const settings = await askSettings(chrome.runtime)
    expect(settings['readingAids.romaji']).toBe(true)
  })

  it('rejects an ask the service worker answers with a failure', async () => {
    const { chrome } = fakeChrome()
    chrome.runtime.onMessage.addListener(
      answerSettings(pages, () => Promise.reject(new Error('gone')))
    )
    await expect(askSettings(chrome.runtime)).rejects.toThrow('without the settings')
  })

  it("keeps a content script's setting through the service worker, and only the settings that fit", async () => {
    const { runtime, store } = settingsChannel()
    await askToWriteSettings(
      { 'videos.captionPlace': { x: 0.5, y: 0.8 }, 'readingAids.romaji': 'yes' } as never,
      runtime
    )
    const settings = await readSettings(store)
    expect(settings['videos.captionPlace']).toEqual({ x: 0.5, y: 0.8 })
    expect(settings['readingAids.romaji']).toBe(false)
  })

  it('clears the caption’s place through the service worker when a double-click puts it back', async () => {
    const { runtime, store } = settingsChannel()
    await askToWriteSettings({ 'videos.captionPlace': { x: 0.2, y: 0.3 } }, runtime)
    await askToWriteSettings({ 'videos.captionPlace': null }, runtime)
    expect((await readSettings(store))['videos.captionPlace']).toBeNull()
  })

  it('takes only the caption boxes’ places from a content script, and refuses any other setting it sends', async () => {
    const { chrome } = fakeChrome()
    const store = chrome.storage.local
    const listener = answerSettings(
      pages,
      () => readSettings(store),
      changes => writeSettings(changes, store)
    )
    const fromSite = (changes: Record<string, unknown>) =>
      new Promise(resolve =>
        listener(
          { target: 'service-worker', settings: 'write', changes },
          { origin: 'https://www.youtube.com' },
          resolve
        )
      )
    await writeSettings({ 'crashReports.send': false }, store)
    await expect(fromSite({ 'videos.captionPlace': { x: 0.4, y: 0.6 } })).resolves.toEqual({
      type: 'written'
    })
    await expect(fromSite({ 'videos.translationPlace': { x: 0.3, y: 0.9 } })).resolves.toEqual({
      type: 'written'
    })
    await expect(
      fromSite({ 'videos.captionPlace': { x: 0.1, y: 0.1 }, 'crashReports.send': true })
    ).resolves.toMatchObject({ type: 'failed' })
    await expect(fromSite({ 'sites.off': ['example.com'] })).resolves.toMatchObject({
      type: 'failed'
    })
    const settings = await readSettings(store)
    expect(settings['videos.captionPlace']).toEqual({ x: 0.4, y: 0.6 })
    expect(settings['videos.translationPlace']).toEqual({ x: 0.3, y: 0.9 })
    expect(settings['crashReports.send']).toBe(false)
    expect(settings['sites.off']).toEqual(settingDefaults['sites.off'])
  })

  it('takes any setting from the extension’s own pages', async () => {
    const { runtime, store } = settingsChannel()
    await askToWriteSettings({ 'crashReports.send': false, 'sites.off': ['example.com'] }, runtime)
    const settings = await readSettings(store)
    expect([settings['crashReports.send'], settings['sites.off']]).toEqual([false, ['example.com']])
  })

  it('rejects a write the service worker could not keep', async () => {
    const { chrome } = fakeChrome()
    chrome.runtime.onMessage.addListener(
      answerSettings(
        pages,
        () => Promise.resolve(settingDefaults),
        () => Promise.reject(new Error('full'))
      )
    )
    await expect(
      askToWriteSettings({ 'readingAids.romaji': true }, chrome.runtime)
    ).rejects.toThrow('kept no settings')
  })

  it('leaves every other message to the other listeners', () => {
    const answer = answerSettings(pages, () => Promise.resolve(settingDefaults))
    expect(
      answer({ target: 'service-worker', request: { type: 'ping' } }, {}, () => undefined)
    ).toBe(false)
    expect(answer(settingsRequest, {}, () => undefined)).toBe(true)
  })

  it('tells every open tab, and one closed tab stops none of the others', async () => {
    const sent: { tabId: number; message: unknown }[] = []
    const tabs = {
      query: () => Promise.resolve([{ id: 1 }, {}, { id: 2 }, { id: 3 }]),
      sendMessage: (tabId: number, message: unknown) => {
        sent.push({ tabId, message })
        return tabId === 2 ? Promise.reject(new Error('closed')) : Promise.resolve()
      }
    }
    await tellOpenTabs(tabs)(settingDefaults)
    expect(sent.map(({ tabId }) => tabId)).toEqual([1, 2, 3])
    expect(sent[0]?.message).toEqual(settingsChanged(settingDefaults))
  })

  it('hears only the settings a change carries', () => {
    const { chrome, inTab } = fakeChrome()
    const heard: Settings[] = []
    const stop = onSettingsChanged(settings => heard.push(settings), inTab(1).onMessage)
    chrome.tabs
      .sendMessage(1, { target: 'offscreen', request: { type: 'ping' } })
      .catch(() => undefined)
    chrome.tabs
      .sendMessage(1, settingsChanged({ ...settingDefaults, 'readingAids.romaji': true }))
      .catch(() => undefined)
    stop()
    chrome.tabs.sendMessage(1, settingsChanged(settingDefaults)).catch(() => undefined)
    expect(heard.map(settings => settings['readingAids.romaji'])).toEqual([true])
  })
})
