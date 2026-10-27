type Respond = (answer: unknown) => void
type MessageListener = (message: unknown, sender: unknown, respond: Respond) => boolean | undefined
type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>
type ChangeListener = (changes: Changes) => void
type TabUpdated = (tabId: number, change: { status?: string }) => void
type Tab = { id: number; url?: string }

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

export function fakeChrome({ tabs = [{ id: 1 }] as Tab[], allowed = true } = {}) {
  const items: Record<string, unknown> = {}
  const changed = chromeEvent<ChangeListener>()
  const messages = chromeEvent<MessageListener>()
  const activated = chromeEvent<() => void>()
  const updated = chromeEvent<TabUpdated>()
  const inTabs = new Map<number, ReturnType<typeof chromeEvent<MessageListener>>>()
  const sent: unknown[] = []
  const requested: string[][] = []
  const opened = { optionsPage: 0 }
  const site = { tabs, active: tabs[0]?.id, allowed }

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
        onChanged: changed.event
      }
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
          site.tabs.filter(tab => !active || tab.id === site.active).map(tab => ({ ...tab }))
        ),
      sendMessage: (tabId: number, message: unknown) =>
        deliver(tabMessages(tabId).listeners, message, {}),
      onActivated: activated.event,
      onUpdated: updated.event
    },
    permissions: {
      contains: () => Promise.resolve(site.allowed),
      request: ({ origins }: { origins: string[] }) => {
        requested.push(origins)
        site.allowed = true
        return Promise.resolve(true)
      }
    }
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

  const load = (tab: Tab) => {
    site.tabs = [...site.tabs.filter(({ id }) => id !== tab.id), tab]
    for (const listener of [...updated.listeners]) {
      listener(tab.id, { status: 'loading' })
      listener(tab.id, { status: 'complete' })
    }
  }

  return { chrome, items, sent, requested, opened, site, inTab, switchTo, load }
}
