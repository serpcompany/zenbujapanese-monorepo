import { Button } from '@zenbu/ui/components/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@zenbu/ui/components/tabs'
import { ChevronLeft } from 'lucide-react'
import { type ComponentType, useEffect, useRef } from 'react'
import mark from '../../../../assets/brand/vector/zenbu-icon-flat-vector.svg'
import type { DataState } from '../shared/data-state'
import { DictionaryProgress } from '../shared/dictionary-progress'
import { labels as sharedLabels } from '../shared/labels'
import { HeaderControls } from './header-controls'
import { labels } from './labels'
import type { PanelState, StackedPage } from './navigation'
import { pages } from './pages'
import type { PanelHost } from './panel-host'
import { isPanelTab, type PanelPage, type PanelPageProps, type PanelTab } from './route'
import { type PanelTabDefinition, tabs } from './tabs'
import { usePanelNavigation } from './use-panel-navigation'

type Navigate = {
  select(tab: PanelTab): void
  open(page: PanelPage): void
  back(): void
}

type Dictionary = { data: DataState | null; again(): void }

const worksWithoutDictionary: PanelTab[] = ['translate']

const isWaitingForData = (data: DataState | null): data is DataState =>
  data !== null &&
  (data.state === 'checking' || data.state === 'downloading' || data.state === 'failed')

function PanelHeader() {
  return (
    <header className="flex items-center gap-2 border-b px-3 py-2">
      <img src={mark} alt="" className="size-6 shrink-0" />
      <h1 className="min-w-0 flex-1 truncate font-heading text-sm font-semibold">
        {sharedLabels.name}
      </h1>
      <HeaderControls />
    </header>
  )
}

function DictionaryWait({ data, again }: { data: DataState; again(): void }) {
  return (
    <div data-dictionary-progress className="flex h-full flex-col items-start gap-3 p-4">
      <DictionaryProgress data={data} />
      {data.state === 'failed' && <Button onClick={again}>{labels.tryAgain}</Button>}
    </div>
  )
}

function PageView({ page, open }: PanelPageProps) {
  const Page = pages[page.page] as ComponentType<PanelPageProps>
  return <Page page={page} open={open} />
}

function useFocusOnMove(topKey: number | undefined) {
  const panel = useRef<HTMLDivElement>(null)
  const backRows = useRef(new Map<number, HTMLButtonElement>())
  const shownKey = useRef(topKey)
  useEffect(() => {
    if (shownKey.current === topKey) return
    shownKey.current = topKey
    const revealed = topKey === undefined ? panel.current : backRows.current.get(topKey)
    revealed?.focus()
  }, [topKey])
  const backRow = (key: number) => (button: HTMLButtonElement | null) => {
    if (!button) return
    backRows.current.set(key, button)
    return () => {
      backRows.current.delete(key)
    }
  }
  return { panel, backRow }
}

function TabStack({
  tab,
  stack,
  dictionary,
  open,
  back
}: { tab: PanelTabDefinition; stack: StackedPage[]; dictionary: Dictionary } & Omit<
  Navigate,
  'select'
>) {
  const top = stack.at(-1)
  const { panel, backRow } = useFocusOnMove(top?.key)
  const waiting = isWaitingForData(dictionary.data) ? dictionary.data : null
  const tabWaits = waiting !== null && !worksWithoutDictionary.includes(tab.id)
  const wait = waiting && <DictionaryWait data={waiting} again={dictionary.again} />
  return (
    <TabsContent ref={panel} value={tab.id} keepMounted className="min-h-0">
      <div hidden={top !== undefined} className="h-full overflow-y-auto">
        {tabWaits ? wait : <tab.Content open={open} />}
      </div>
      {stack.map(({ key, page }) => (
        <div key={key} hidden={key !== top?.key} className="flex h-full flex-col">
          <div className="border-b px-2 py-1">
            <Button
              ref={backRow(key)}
              variant="ghost"
              size="sm"
              aria-label={labels.backTo(tab.label)}
              onClick={back}
            >
              <ChevronLeft data-icon="inline-start" />
              {tab.label}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {wait || <PageView page={page} open={open} />}
          </div>
        </div>
      ))}
    </TabsContent>
  )
}

function PanelTabs({
  state,
  dictionary,
  select,
  open,
  back
}: { state: PanelState; dictionary: Dictionary } & Navigate) {
  return (
    <Tabs
      value={state.tab}
      onValueChange={value => isPanelTab(value) && select(value)}
      className="min-h-0 flex-1 gap-0"
    >
      {tabs.map(tab => (
        <TabStack
          key={tab.id}
          tab={tab}
          stack={state.stacks[tab.id]}
          dictionary={dictionary}
          open={open}
          back={back}
        />
      ))}
      <div className="border-t p-2">
        <TabsList
          activateOnFocus
          aria-label={labels.tabBar}
          className="w-full group-data-horizontal/tabs:h-auto"
        >
          {tabs.map(tab => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="min-w-0 flex-col gap-0.5 px-0.5 py-1 text-xs"
            >
              <tab.icon />
              <span className="max-w-full truncate">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  )
}

export function SidePanel({ host, data, again }: { host: PanelHost } & Dictionary) {
  const { state, ...navigate } = usePanelNavigation(host)
  return (
    <div className="flex h-dvh min-w-0 flex-col">
      <PanelHeader />
      {state && <PanelTabs state={state} dictionary={{ data, again }} {...navigate} />}
    </div>
  )
}
