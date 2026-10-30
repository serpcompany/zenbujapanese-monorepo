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
  back(): void
  lookups?: WordLookups
}

export function FullEntry({ first, settings, notices, backLabel, back, lookups }: FullEntryProps) {
  const [stack, setStack] = useState<Stacked[]>([{ key: 0, page: first }])
  const top = stack[stack.length - 1] as Stacked
  const backButtons = useRef(new Map<number, HTMLButtonElement>())
  useEffect(() => {
    backButtons.current.get(top.key)?.focus({ preventScroll: true })
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
  const backButton = (key: number) => (button: HTMLButtonElement | null) => {
    if (!button) return
    backButtons.current.set(key, button)
    return () => {
      backButtons.current.delete(key)
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
            <Button ref={backButton(key)} variant="ghost" size="sm" onClick={goBack}>
              <ChevronLeftIcon data-icon="inline-start" />
              {backLabel}
            </Button>
          </div>
          <ReadingAids
            settings={settings}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
          >
            <PageView page={page} open={open} settings={settings} lookups={lookups} />
          </ReadingAids>
        </section>
      ))}
    </NoticesProvider>
  )
}
