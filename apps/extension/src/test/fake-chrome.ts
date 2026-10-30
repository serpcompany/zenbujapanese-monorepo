type Respond = (answer: unknown) => void
type MessageListener = (message: unknown, sender: unknown, respond: Respond) => boolean | undefined
type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>
type ChangeListener = (changes: Changes) => void
type TabUpdated = (tabId: number, change: { status?: string }) => void
type Tab = { id: number; url: string }

function chromeEvent<Listener>() {
  const listeners = new Set<Listener>()
  return {
    listeners,
    event: {
      addListener: (listener: Listener) => void listeners.add(listener),
      removeListener: (listener: Listener) => void listeners.delete(listener)
    }
  }
}

const deliver = (listeners: Set<MessageListener>, message: unknown, sender: unknown) =>
  new Promise<unknown>((resolve, reject) => {
    let answering = false
    for (const listener of [...listeners]) {
      if (listener(message, sender, resolve) === true) answering = true
    }
    if (!answering) reject(new Error('Receiving end does not exist.'))
  })

const covers = (pattern: string, address: string) => {
  const [scheme, host] = pattern.split(/:\/\/|\//)
  const url = URL.parse(address)
  return url !== null && url.protocol === `${scheme}:` && (host === '*' || host === url.hostname)
}

function sessionArea() {
  const items = new Map<string, unknown>()
  return {
    get: (keys: string[]) =>
      Promise.resolve(
        Object.fromEntries(keys.filter(key => items.has(key)).map(key => [key, items.get(key)]))
      ),
    set: (next: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(next)) items.set(key, structuredClone(value))
      return Promise.resolve()
    },
    remove: (keys: string[]) => {
      for (const key of keys) items.delete(key)
      return Promise.resolve()
    }
  }
}

export const allSites = ['http://*/*', 'https://*/*']

export function fakeChrome({ tabs = [] as Tab[], granted = [] as string[] } = {}) {
  const items: Record<string, unknown> = {}
  const changed = chromeEvent<ChangeListener>()
  const messages = chromeEvent<MessageListener>()
  const activated = chromeEvent<() => void>()
  const updated = chromeEvent<TabUpdated>()
  const added = chromeEvent<() => void>()
  const removed = chromeEvent<() => void>()
  const inTabs = new Map<number, ReturnType<typeof chromeEvent<MessageListener>>>()
  const sent: unknown[] = []
  const requested: string[][] = []
  const opened = { optionsPage: 0 }
  const site = { tabs, active: tabs[0]?.id, granted, clicked: new Set<number>() }

  const shows = (tab: Tab) =>
    site.clicked.has(tab.id) || site.granted.some(pattern => covers(pattern, tab.url))

  const tabMessages = (tabId: number) => {
    const known = inTabs.get(tabId) ?? chromeEvent<MessageListener>()
    inTabs.set(tabId, known)
    return known
  }

  const chrome = {
    storage: {
      local: {
        get: (keys: string[]) =>
          Promise.resolve(
            Object.fromEntries(
              keys.filter(key => key in items).map(key => [key, structuredClone(items[key])])
            )
          ),
        set: (next: Record<string, unknown>) => {
          const changes: Changes = {}
          for (const [key, value] of Object.entries(next)) {
            changes[key] = { oldValue: items[key], newValue: value }
            items[key] = structuredClone(value)
          }
          queueMicrotask(() => {
            for (const listener of [...changed.listeners]) listener(changes)
          })
          return Promise.resolve()
        },
        remove: (keys: string[]) => {
          const changes: Changes = {}
          for (const key of keys.filter(key => key in items)) {
            changes[key] = { oldValue: items[key] }
            delete items[key]
          }
          queueMicrotask(() => {
            for (const listener of [...changed.listeners]) listener(changes)
          })
          return Promise.resolve()
        },
        setAccessLevel: () => Promise.resolve(),
        onChanged: changed.event
      },
      session: sessionArea()
    },
    runtime: {
      onMessage: messages.event,
      sendMessage: (message: unknown) => {
        sent.push(message)
        return deliver(messages.listeners, message, {})
      },
      openOptionsPage: () => {
        opened.optionsPage += 1
        return Promise.resolve()
      }
    },
    tabs: {
      query: ({ active }: { active?: boolean }) =>
        Promise.resolve(
          site.tabs
            .filter(tab => !active || tab.id === site.active)
            .map(tab => (shows(tab) ? { ...tab } : { id: tab.id }))
        ),
      sendMessage: (tabId: number, message: unknown) =>
        deliver(tabMessages(tabId).listeners, message, {}),
      onActivated: activated.event,
      onUpdated: updated.event
    },
    permissions: {
      contains: ({ origins }: { origins: string[] }) =>
        Promise.resolve(
          origins.every(origin =>
            site.granted.some(pattern => covers(pattern, origin.replace('/*', '/')))
          )
        ),
      request: ({ origins }: { origins: string[] }) => {
        requested.push(origins)
        grant(origins)
        return Promise.resolve(true)
      },
      onAdded: added.event,
      onRemoved: removed.event
    }
  }

  const grant = (origins: string[]) => {
    site.granted = [...site.granted, ...origins]
    for (const listener of [...added.listeners]) listener()
  }

  const revoke = (origins: string[]) => {
    site.granted = site.granted.filter(pattern => !origins.includes(pattern))
    for (const listener of [...removed.listeners]) listener()
  }

  const inTab = (tabId: number) => ({
    onMessage: tabMessages(tabId).event,
    sendMessage: (message: unknown) => {
      sent.push(message)
      return deliver(messages.listeners, message, { tab: { id: tabId } })
    }
  })

  const switchTo = (tabId: number) => {
    site.active = tabId
    for (const listener of [...activated.listeners]) listener()
  }

  const clickIcon = (tabId: number) => {
    site.clicked.add(tabId)
  }

  const load = (tab: Tab) => {
    site.clicked.delete(tab.id)
    site.tabs = [...site.tabs.filter(({ id }) => id !== tab.id), tab]
    for (const listener of [...updated.listeners]) {
      listener(tab.id, { status: 'loading' })
      listener(tab.id, { status: 'complete' })
    }
  }

  return {
    chrome,
    items,
    sent,
    requested,
    opened,
    site,
    inTab,
    switchTo,
    load,
    clickIcon,
    grant,
    revoke
  }
}
