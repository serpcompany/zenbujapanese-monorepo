'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

// A list that renders its first items with the page, then loads the next ones from a JSON route
// named for the dictionary build the page came from, as the list scrolls into view or with the
// button: a word page's examples, a search's words, and a search's example sentences. Each
// request asks for the items from the number it already shows, so none repeats or is skipped. A
// route that no longer knows the build (a deploy since the page loaded) answers 404, and the list
// offers a reload instead.

export interface LoadMoreLabels {
  more: string
  loading: string
  stale: string
  reload: string
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
  const hasMore = items.length < total

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || stale) return
    setLoading(true)
    setFailed(false)
    try {
      const response = await fetch(`${path}&from=${items.length}`)
      if (response.status === 404) {
        setStale(true)
        return
      }
      if (!response.ok) throw new Error(`${response.status}`)
      const more = read(await response.json())
      if (more.length === 0) setStale(true)
      else setItems(current => [...current, ...more])
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [items.length, hasMore, loading, path, read, stale])

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
