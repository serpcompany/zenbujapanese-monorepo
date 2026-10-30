import { describe, expect, it } from 'vitest'
import { answerSettings, tellOpenTabs } from '../service-worker/settings'
import { fakeChrome } from '../test/fake-chrome'
import {
  askSettings,
  askToWriteSettings,
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

  it('keeps the caption’s place only as two shares, and none by default', () => {
    const place = (stored: unknown) => settingsFrom({ 'videos.captionPlace': stored })
    expect(settingDefaults['videos.captionPlace']).toBeNull()
    expect(place({ x: 0, y: 1 })['videos.captionPlace']).toEqual({ x: 0, y: 1 })
    for (const stored of [
      { x: 0.5 },
      { x: 0.5, y: 1.5 },
      { x: '0.5', y: 0 },
      [0.5, 0.5],
      0.5,
      null
    ])
      expect(place(stored)['videos.captionPlace']).toBeNull()
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
    chrome.runtime.onMessage.addListener(answerSettings(() => readSettings(chrome.storage.local)))
    const settings = await askSettings(chrome.runtime)
    expect(settings['readingAids.romaji']).toBe(true)
  })

  it('rejects an ask the service worker answers with a failure', async () => {
    const { chrome } = fakeChrome()
    chrome.runtime.onMessage.addListener(answerSettings(() => Promise.reject(new Error('gone'))))
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

  it('rejects a write the service worker could not keep', async () => {
    const { chrome } = fakeChrome()
    chrome.runtime.onMessage.addListener(
      answerSettings(
        () => Promise.resolve(settingDefaults),
        () => Promise.reject(new Error('full'))
      )
    )
    await expect(
      askToWriteSettings({ 'readingAids.romaji': true }, chrome.runtime)
    ).rejects.toThrow('kept no settings')
  })

  it('leaves every other message to the other listeners', () => {
    const answer = answerSettings(() => Promise.resolve(settingDefaults))
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
