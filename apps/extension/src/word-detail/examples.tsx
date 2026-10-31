import type { Example } from '@zenbu/dictionary-core/detail/examples'
import { type ExampleActions, ExampleList } from '@zenbu/ui/dictionary/example-list'
import type { LoadMore } from '@zenbu/ui/dictionary/load-more'
import { useCallback } from 'react'
import { wordDetailLabels } from './labels'

export type LoadExamples = (from: number) => Promise<Example[] | null>

const keepList = () => undefined

export function PagedExamples({
  initial,
  listed,
  load,
  ...actions
}: ExampleActions & { initial: Example[]; listed: number; load: LoadExamples }) {
  const loadMore = useCallback<LoadMore<Example>>(
    async from => {
      const items = await load(from)
      return items ? { kind: 'items', items } : { kind: 'failed' }
    },
    [load]
  )
  return (
    <ExampleList
      initial={initial}
      paging={{ listed, loadMore, onReload: keepList }}
      lang={wordDetailLabels.lang}
      text={wordDetailLabels}
      {...actions}
    />
  )
}
