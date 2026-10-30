import { Button } from '@zenbu/ui/components/button'
import { ChevronLeftIcon } from 'lucide-react'
import { type ComponentType, useCallback, useEffect, useRef, useState } from 'react'
import type { Settings } from '../shared/settings'
import type { EntryPage } from './entry-page'
import { FormExamplesPage } from './form-examples-page'
import { KanjiDetailPage } from './kanji-detail-page'
import type { WordLookups } from './lookups'
import { type Notices, NoticesProvider } from './notice'
import type { EntryPageProps } from './page-states'
import { ReadingAids } from './reading-aids'
import { WordDetailPage } from './word-detail-page'

const pages: {
  [K in EntryPage['page']]: ComponentType<EntryPageProps<Extract<EntryPage, { page: K }>>>
} = {
  word: WordDetailPage,
  kanji: KanjiDetailPage,
  form: FormExamplesPage
}

function PageView(props: EntryPageProps<EntryPage>) {
  const Page = pages[props.page.page] as ComponentType<EntryPageProps<EntryPage>>
  return <Page {...props} />
}

type Stacked = { key: number; page: EntryPage }

export type FullEntryProps = {
  first: EntryPage
  settings: Settings
  notices: Notices
  backLabel: string
  entryLabel: string
  back(): void
  lookups?: WordLookups
}

const scrollerClass =
  'min-h-0 flex-1 overflow-y-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset'

export function FullEntry({
  first,
  settings,
  notices,
  backLabel,
  entryLabel,
  back,
  lookups
}: FullEntryProps) {
  const [stack, setStack] = useState<Stacked[]>([{ key: 0, page: first }])
  const top = stack[stack.length - 1] as Stacked
  const scrollers = useRef(new Map<number, HTMLElement>())
  useEffect(() => {
    scrollers.current.get(top.key)?.focus({ preventScroll: true })
  }, [top.key])
  const open = useCallback(
    (page: EntryPage) =>
      setStack(current => [...current, { key: (current.at(-1)?.key ?? 0) + 1, page }]),
    []
  )
  const goBack = () => {
    if (stack.length > 1) setStack(current => current.slice(0, -1))
    else back()
  }
  const scroller = (key: number) => (element: HTMLElement | null) => {
    if (!element) return
    scrollers.current.set(key, element)
    return () => {
      scrollers.current.delete(key)
    }
  }
  return (
    <NoticesProvider value={notices}>
      {stack.map(({ key, page }) => (
        <section
          key={key}
          hidden={key !== top.key}
          data-entry-page={page.page}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="border-b px-2 py-1">
            <Button variant="ghost" size="sm" onClick={goBack}>
              <ChevronLeftIcon data-icon="inline-start" />
              {backLabel}
            </Button>
          </div>
          <section
            ref={scroller(key)}
            aria-label={entryLabel}
            tabIndex={0}
            className={scrollerClass}
          >
            <ReadingAids settings={settings} className="flex flex-col gap-4 p-4">
              <PageView page={page} open={open} settings={settings} lookups={lookups} />
            </ReadingAids>
          </section>
        </section>
      ))}
    </NoticesProvider>
  )
}
