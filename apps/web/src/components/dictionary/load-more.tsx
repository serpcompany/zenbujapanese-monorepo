'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export interface LoadMoreLabels {
  more: string
  loading: string
  stale: string
  reload: string
}

export type NextPage<T> =
  | { kind: 'items'; items: T[] }
  | { kind: 'stale' }
  | { kind: 'failed' }
  | { kind: 'busy' }

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
  total: number
  path: string
  read: (response: unknown) => T[]
}) {
  const [items, setItems] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [stale, setStale] = useState(false)
  const end = useRef<HTMLDivElement>(null)
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
