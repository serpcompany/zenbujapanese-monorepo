import type { SessionStorage } from '../session-store'

export function memoryStorage(): SessionStorage & { items: Map<string, unknown> } {
  const items = new Map<string, unknown>()
  return {
    items,
    get: async key =>
      structuredClone(
        Object.fromEntries([...items].filter(([name]) => key === undefined || name === key))
      ),
    set: async values => {
      for (const [key, value] of Object.entries(values)) items.set(key, structuredClone(value))
    },
    remove: async key => {
      items.delete(key)
    }
  }
}
