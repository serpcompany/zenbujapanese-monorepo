import { describe, expect, it } from 'vitest'
import { stopPageLookup } from '../page-lookup/messages'
import { apiOrigin, languageDataOrigin } from '../shared/hosts'
import { keepPageScriptRegistered, type PageScriptBrowser, pageOrigins } from './page-scripts'

type Granted = { origins?: string[] }
type Listener = (permissions: Granted) => void
type Tab = { id: number; url: string; hostPattern: string }

function fakeBrowser({ granted = [] as string[], tabs = [] as Tab[], failing = false } = {}) {
  const site = { granted, registered: [] as { id: string; matches: string[] }[] }
  const added = new Set<Listener>()
  const removed = new Set<Listener>()
  const installed = new Set<(details: { reason: string }) => void>()
  const injected: number[] = []
  const stopped: number[] = []
  const covers = (patterns: readonly string[], tab: Tab) =>
    patterns.includes(tab.hostPattern) ||
    (patterns.includes(everyHttpsSite) && tab.url.startsWith('https://'))
  const shows = (tab: Tab) => covers(site.granted, tab) || ownHosts.includes(tab.hostPattern)
  const browser: PageScriptBrowser = {
    runtime: { onInstalled: { addListener: listener => void installed.add(listener) } },
    permissions: {
      getAll: () =>
        failing ? Promise.reject(new Error('down')) : Promise.resolve({ origins: site.granted }),
      onAdded: { addListener: listener => void added.add(listener) },
      onRemoved: { addListener: listener => void removed.add(listener) }
    },
    scripting: {
      getRegisteredContentScripts: ({ ids }) =>
        Promise.resolve(site.registered.filter(script => ids.includes(script.id))),
      registerContentScripts: scripts => {
        site.registered = [...site.registered, ...scripts]
        return Promise.resolve()
      },
      updateContentScripts: scripts => {
        site.registered = scripts
        return Promise.resolve()
      },
      unregisterContentScripts: ({ ids }) => {
        site.registered = site.registered.filter(script => !ids.includes(script.id))
        return Promise.resolve()
      },
      executeScript: ({ target }) => {
        injected.push(target.tabId)
        return Promise.resolve([])
      }
    },
    tabs: {
      query: ({ url }) =>
        Promise.resolve(
          tabs
            .filter(tab => url === undefined || covers(url, tab))
            .map(tab => (shows(tab) ? { id: tab.id, url: tab.url } : { id: tab.id }))
        ),
      sendMessage: (tabId, message) => {
        if (message === stopPageLookup) stopped.push(tabId)
        return tabId === 404 ? Promise.reject(new Error('gone')) : Promise.resolve()
      }
    }
  }
  const settle = () => new Promise(resolve => setTimeout(resolve, 0))
  const grant = async (origins: string[]) => {
    site.granted = [...site.granted, ...origins]
    for (const listener of added) listener({ origins })
    await settle()
  }
  const revoke = async (origins: string[]) => {
    site.granted = site.granted.filter(origin => !origins.includes(origin))
    for (const listener of removed) listener({ origins })
    await settle()
  }
  const install = async (reason: string) => {
    for (const listener of installed) listener({ reason })
    await settle()
  }
  return { browser, site, injected, stopped, grant, revoke, install }
}

const everyHttpsSite = 'https://*/*'

const youtube = 'https://www.youtube.com/*'

const ownHosts = [youtube]

const example = 'https://example.com/*'
const exampleTab: Tab = { id: 7, url: 'https://example.com/a', hostPattern: example }

describe('page script registration', () => {
  it('leaves out the hosts the extension holds for itself', () => {
    expect(pageOrigins([`${languageDataOrigin}/*`, 'https://www.youtube.com/*', example])).toEqual([
      example
    ])
  })

  it('never counts the account service host as a site the learner gave', () => {
    expect(pageOrigins([`${apiOrigin}/*`, example])).toEqual([example])
  })

  it("registers no page script while only the extension's own hosts are granted", async () => {
    const fake = fakeBrowser({
      granted: [`${languageDataOrigin}/*`, `${apiOrigin}/*`, 'https://www.youtube.com/*']
    })
    await keepPageScriptRegistered(fake.browser, () => undefined)
    expect(fake.site.registered).toEqual([])
  })

  it('registers the page script for the granted sites when the service worker starts', async () => {
    const fake = fakeBrowser({ granted: [`${languageDataOrigin}/*`, example] })
    await keepPageScriptRegistered(fake.browser, () => undefined)
    expect(fake.site.registered).toEqual([
      {
        id: 'page-lookup',
        js: ['page-lookup.js'],
        matches: [example],
        runAt: 'document_idle',
        persistAcrossSessions: true
      }
    ])
  })

  it('registers nothing while only its own hosts are granted', async () => {
    const fake = fakeBrowser({ granted: ['https://www.youtube.com/*'] })
    await keepPageScriptRegistered(fake.browser, () => undefined)
    expect(fake.site.registered).toEqual([])
  })

  it('adds a site and reaches its open tabs when the learner allows it', async () => {
    const fake = fakeBrowser({ tabs: [exampleTab] })
    await keepPageScriptRegistered(fake.browser, () => undefined)
    await fake.grant([example])
    expect(fake.site.registered.map(script => script.matches)).toEqual([[example]])
    expect(fake.injected).toEqual([7])
  })

  it.each([
    'install',
    'update'
  ])('puts the page script back into the open tabs of the allowed sites on %s', async reason => {
    const video: Tab = { id: 9, url: 'https://www.youtube.com/watch?v=a', hostPattern: youtube }
    const other: Tab = {
      id: 8,
      url: 'https://news.example/',
      hostPattern: 'https://news.example/*'
    }
    const fake = fakeBrowser({ granted: [youtube, example], tabs: [exampleTab, other, video] })
    await keepPageScriptRegistered(fake.browser, () => undefined)
    expect(fake.injected).toEqual([])
    await fake.install(reason)
    expect(fake.site.registered.map(script => script.matches)).toEqual([[example]])
    expect(fake.injected).toEqual([7])
  })

  it('leaves open tabs alone when Chrome itself updates', async () => {
    const fake = fakeBrowser({ granted: [example], tabs: [exampleTab] })
    await keepPageScriptRegistered(fake.browser, () => undefined)
    await fake.install('chrome_update')
    expect(fake.injected).toEqual([])
  })

  it('updates the sites when one more is allowed', async () => {
    const fake = fakeBrowser({ granted: [example] })
    await keepPageScriptRegistered(fake.browser, () => undefined)
    await fake.grant(['https://news.example/*'])
    expect(fake.site.registered.map(script => script.matches)).toEqual([
      [example, 'https://news.example/*']
    ])
  })

  it('unregisters and stops the open tabs it can no longer reach when a site is taken back', async () => {
    const other: Tab = {
      id: 8,
      url: 'https://news.example/',
      hostPattern: 'https://news.example/*'
    }
    const fake = fakeBrowser({ granted: [example, other.hostPattern], tabs: [exampleTab, other] })
    await keepPageScriptRegistered(fake.browser, () => undefined)
    await fake.revoke([example])
    expect(fake.site.registered.map(script => script.matches)).toEqual([[other.hostPattern]])
    expect(fake.stopped).toEqual([7])
    await fake.revoke([other.hostPattern])
    expect(fake.site.registered).toEqual([])
  })

  it('stops the tabs Every Site reached, YouTube’s too, when Every Site is taken back', async () => {
    const video: Tab = { id: 9, url: 'https://www.youtube.com/watch?v=a', hostPattern: youtube }
    const fake = fakeBrowser({
      granted: [youtube, everyHttpsSite, example],
      tabs: [video, exampleTab]
    })
    await keepPageScriptRegistered(fake.browser, () => undefined)
    expect(fake.site.registered.map(script => script.matches)).toEqual([[everyHttpsSite, example]])
    await fake.revoke([everyHttpsSite])
    expect(fake.site.registered.map(script => script.matches)).toEqual([[example]])
    expect(fake.stopped).toEqual([9])
  })

  it('carries on when a tab has closed before it hears the stop', async () => {
    const gone: Tab = { id: 404, url: 'https://example.com/b', hostPattern: example }
    const fake = fakeBrowser({ granted: [example], tabs: [gone, exampleTab] })
    const reported: string[] = []
    await keepPageScriptRegistered(fake.browser, code => reported.push(code))
    await fake.revoke([example])
    expect(fake.stopped).toEqual([404, 7])
    expect(reported).toEqual([])
  })

  it('reports a failure by its code alone', async () => {
    const fake = fakeBrowser({ failing: true })
    const reported: string[] = []
    await keepPageScriptRegistered(fake.browser, code => reported.push(code))
    expect(reported).toEqual(['page-script'])
  })
})
