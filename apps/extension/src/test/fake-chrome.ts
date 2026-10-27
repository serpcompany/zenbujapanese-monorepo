type Respond = (answer: unknown) => void
type MessageListener = (message: unknown, sender: unknown, respond: Respond) => boolean | undefined
type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>
type ChangeListener = (changes: Changes) => void
type Tab = { id: number; url?: string; favIconUrl?: string }

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

export function fakeChrome({ tab = { id: 1 } as Tab, allowed = true } = {}) {
  const items: Record<string, unknown> = {}
  const changed = chromeEvent<ChangeListener>()
  const messages = chromeEvent<MessageListener>()
  const sent: unknown[] = []
  const toTabs: { tabId: number; message: unknown }[] = []
  const requested: string[][] = []
  const opened = { optionsPage: 0 }
  const site = { tab, allowed }

  const deliver = (message: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      let answering = false
      for (const listener of [...messages.listeners]) {
        if (listener(message, {}, resolve) === true) answering = true
      }
      if (!answering) reject(new Error('Receiving end does not exist.'))
    })

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
        return deliver(message)
      },
      openOptionsPage: () => {
        opened.optionsPage += 1
        return Promise.resolve()
      }
    },
    tabs: {
      query: () => Promise.resolve([site.tab]),
      sendMessage: (tabId: number, message: unknown) => {
        toTabs.push({ tabId, message })
        return deliver(message)
      }
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

  return { chrome, items, sent, toTabs, requested, opened, site }
}
