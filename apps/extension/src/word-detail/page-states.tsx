import { Button } from '@zenbu/ui/components/button'
import { Empty, EmptyHeader, EmptyTitle } from '@zenbu/ui/components/empty'
import type { ComponentType } from 'react'
import { DictionaryProgress } from '../shared/dictionary-progress'
import type { Settings } from '../shared/settings'
import { useSettings } from '../shared/use-settings'
import type { PanelPage, PanelPageProps } from '../side-panel/route'
import { wordDetailLabels } from './labels'
import type { Unanswered, WordLookups } from './lookups'
import { ReadingAids } from './reading-aids'

export function NotFound({ message }: { message: string }) {
  return (
    <Empty data-lookup="not-found">
      <EmptyHeader>
        <EmptyTitle>{message}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  )
}

export function UnansweredLookup({ result, retry }: { result: Unanswered; retry: () => void }) {
  if (result.state === 'looking') return <div data-lookup="looking" />
  if (result.state === 'not-ready') return <DictionaryProgress data={result.data} />
  const { failed, tryAgain } = wordDetailLabels.lookup
  return (
    <Empty data-lookup="failed">
      <EmptyHeader>
        <EmptyTitle>{failed}</EmptyTitle>
      </EmptyHeader>
      <Button variant="outline" onClick={retry}>
        {tryAgain}
      </Button>
    </Empty>
  )
}

type PageProps<P extends PanelPage> = PanelPageProps<P> & { lookups?: WordLookups }

export type FramedProps<P extends PanelPage> = PageProps<P> & { settings: Settings }

export function framed<P extends PanelPage>(
  Page: ComponentType<FramedProps<P>>
): ComponentType<PageProps<P>> {
  return function FramedPage(props: PageProps<P>) {
    const settings = useSettings()
    if (!settings) return null
    return (
      <ReadingAids settings={settings} className="flex flex-col gap-4 p-4">
        <Page {...props} settings={settings} />
      </ReadingAids>
    )
  }
}
