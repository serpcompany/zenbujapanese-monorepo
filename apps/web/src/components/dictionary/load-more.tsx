'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

// A list that renders its first items with the page, then loads the next ones from a JSON route
// named for the dictionary build the page came from, as the list scrolls into view or with the
// button: a word page's, a search's, and a conjugated form's example sentences. Each
// request asks for the items from the number it already shows, so none repeats or is skipped. A
// route that no longer knows the build (a deploy since the page loaded) answers 404, and the list
// offers a reload instead.

export interface LoadMoreLabels {
  more: string
  loading: string
  stale: string
  reload: string
}

/** What a request for the next page found. */
export type NextPage<T> =
  | { kind: 'items'; items: T[] }
  /** The route no longer knows the page's build, or has nothing more for it. */
  | { kind: 'stale' }
  | { kind: 'failed' }
  /** Another request for the list is still running, so this one asked for nothing. */
  | { kind: 'busy' }

/**
 * Fetches a list's next page, unless one is already on its way: a click on Load more and the
 * list scrolling into view can ask at once, for the same position, and only the first may fetch.
 */
export async function loadNextPage<T>(
  inFlight: { current: boolean },
  url: string,
  read: (response: unknown) => T[],
  fetcher: (url: string) => Promise<Response> = fetch
): Promise<NextPage<T>> {
  if (inFlight.current) return { kind: 'busy' }
  inFlight.current = true
  try {
    const response = await fetcher(url)
    if (response.status === 404) return { kind: 'stale' }
    if (!response.ok) return { kind: 'failed' }
    const items = read(await response.json())
    return items.length === 0 ? { kind: 'stale' } : { kind: 'items', items }
  } catch {
    return { kind: 'failed' }
  } finally {
    inFlight.current = false
  }
}

export function useLoadMore<T>({
  initial,
  total,
  path,
  read
}: {
  initial: T[]
  /** How many items the list has in all. */
  total: number
  /** The JSON route, with its query string; `&from=<n>` is added. */
  path: string
  /** The items in the route's response. */
  read: (response: unknown) => T[]
}) {
  const [items, setItems] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  // The dictionary was updated since the page loaded, so its next items are another list's.
  const [stale, setStale] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  // Set synchronously, unlike `loading`, so a click and the observer can't both fetch.
  const inFlight = useRef(false)
  const hasMore = items.length < total

  const loadMore = useCallback(async () => {
    if (inFlight.current || !hasMore || stale) return
    setLoading(true)
    setFailed(false)
    const page = await loadNextPage(inFlight, `${path}&from=${items.length}`, read)
    if (page.kind === 'busy') return
    if (page.kind === 'items') setItems(current => [...current, ...page.items])
    else if (page.kind === 'stale') setStale(true)
    else setFailed(true)
    setLoading(false)
  }, [items.length, hasMore, path, read, stale])

  useEffect(() => {
    const target = end.current
    if (!target || !hasMore || failed || stale) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) void loadMore()
      },
      { rootMargin: '400px' }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [failed, hasMore, loadMore, stale])

  return { items, loading, failed, stale, hasMore, end, loadMore }
}

/** What follows the list: the Load more button the list also scrolls into, or the reload offer. */
export function LoadMoreFooter({
  state,
  labels
}: {
  state: Pick<
    ReturnType<typeof useLoadMore>,
    'loading' | 'failed' | 'stale' | 'hasMore' | 'end' | 'loadMore'
  >
  labels: LoadMoreLabels
}): ReactNode {
  if (!state.hasMore) return null
  if (state.stale) {
    return (
      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
        <p>{labels.stale}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {labels.reload}
        </Button>
      </div>
    )
  }
  return (
    <div ref={state.end} className="flex justify-center">
      <Button variant="outline" onClick={() => void state.loadMore()} disabled={state.loading}>
        {state.loading ? labels.loading : state.failed ? 'Try again' : labels.more}
      </Button>
    </div>
  )
}
