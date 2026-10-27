import type { LoadedPage } from '@zenbu/ui/dictionary/load-more'
import type { PageExample } from './page-example'

type Fetcher = (url: string) => Promise<Response>

export async function fetchExamplePage(
  url: string,
  fetcher: Fetcher = fetch
): Promise<LoadedPage<PageExample>> {
  const response = await fetcher(url)
  if (response.status === 404) return { kind: 'stale' }
  if (!response.ok) return { kind: 'failed' }
  const { examples } = (await response.json()) as { examples: PageExample[] }
  return examples.length === 0 ? { kind: 'stale' } : { kind: 'items', items: examples }
}

export async function fetchFormExamples(
  surface: string,
  fetcher: Fetcher = fetch
): Promise<PageExample[]> {
  const response = await fetcher(`/dictionary/conjugations/${encodeURIComponent(surface)}.json`)
  if (!response.ok) throw new Error(`${response.status}`)
  const { examples } = (await response.json()) as { examples: PageExample[] }
  return examples
}
