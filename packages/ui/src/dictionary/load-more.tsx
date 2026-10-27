'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../components/button'

export interface LoadMoreLabels {
  more: string
  loading: string
  stale: string
  reload: string
  retry: string
}

export type LoadedPage<T> = { kind: 'items'; items: T[] } | { kind: 'stale' } | { kind: 'failed' }

export type LoadMore<T> = (from: number) => Promise<LoadedPage<T>>

export type NextPage<T> = LoadedPage<T> | { kind: 'busy' }

export async function loadNextPage<T>(
  inFlight: { current: boolean },
  from: number,
  loadMore: LoadMore<T>
): Promise<NextPage<T>> {
  if (inFlight.current) return { kind: 'busy' }
  inFlight.current = true
  try {
    return await loadMore(from)
  } catch {
    return { kind: 'failed' }
  } finally {
    inFlight.current = false
  }
}

export function useLoadMore<T>({
  initial,
  total,
  loadMore
}: {
  initial: T[]
  total: number
  loadMore: LoadMore<T>
}) {
  const [items, setItems] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [stale, setStale] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const inFlight = useRef(false)
  const hasMore = items.length < total

  const loadNext = useCallback(async () => {
    if (inFlight.current || !hasMore || stale) return
    setLoading(true)
    setFailed(false)
    const page = await loadNextPage(inFlight, items.length, loadMore)
    if (page.kind === 'busy') return
    if (page.kind === 'items') setItems(current => [...current, ...page.items])
    else if (page.kind === 'stale') setStale(true)
    else setFailed(true)
    setLoading(false)
  }, [items.length, hasMore, loadMore, stale])

  useEffect(() => {
    const target = end.current
    if (!target || !hasMore || failed || stale) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) void loadNext()
      },
      { rootMargin: '400px' }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [failed, hasMore, loadNext, stale])

  return { items, loading, failed, stale, hasMore, end, loadMore: loadNext }
}

export function LoadMoreFooter({
  state,
  labels,
  onReload
}: {
  state: Pick<
    ReturnType<typeof useLoadMore>,
    'loading' | 'failed' | 'stale' | 'hasMore' | 'end' | 'loadMore'
  >
  labels: LoadMoreLabels
  onReload: () => void
}): ReactNode {
  if (!state.hasMore) return null
  if (state.stale) {
    return (
      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
        <p>{labels.stale}</p>
        <Button variant="outline" onClick={() => onReload()}>
          {labels.reload}
        </Button>
      </div>
    )
  }
  return (
    <div ref={state.end} className="flex justify-center">
      <Button variant="outline" onClick={() => void state.loadMore()} disabled={state.loading}>
        {state.loading ? labels.loading : state.failed ? labels.retry : labels.more}
      </Button>
    </div>
  )
}
