import { vi } from 'vitest'

export function keptAnswers() {
  const kept = new Map<string, Response>()
  vi.stubGlobal('caches', {
    default: {
      match: async (key: Request) => kept.get(key.url)?.clone(),
      put: async (key: Request, response: Response) => {
        kept.set(key.url, response)
      }
    }
  })
  return kept
}
