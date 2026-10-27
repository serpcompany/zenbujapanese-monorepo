import { Button } from '@zenbu/ui/components/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@zenbu/ui/components/tabs'
import { ChevronLeft, Settings } from 'lucide-react'
import type { ComponentType } from 'react'
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

const isWaitingForData = (data: DataState | null): data is DataState =>
  data !== null &&
  (data.state === 'checking' || data.state === 'downloading' || data.state === 'failed')

function PanelHeader({ openSettings }: { openSettings(): void }) {
  return (
    <header className="flex items-center gap-2 border-b px-3 py-2">
      <img src={mark} alt="" className="size-6 shrink-0" />
      <h1 className="min-w-0 flex-1 truncate font-heading text-sm font-semibold">
        {sharedLabels.name}
      </h1>
      <HeaderControls />
      <Button variant="ghost" size="icon" aria-label={labels.settings} onClick={openSettings}>
        <Settings />
      </Button>
    </header>
  )
}

function PageView({ page, open }: PanelPageProps) {
  const Page = pages[page.page] as ComponentType<PanelPageProps>
  return <Page page={page} open={open} />
}

function TabStack({
  tab,
  stack,
  open,
  back
}: { tab: PanelTabDefinition; stack: StackedPage[] } & Omit<Navigate, 'select'>) {
  const top = stack.at(-1)
  return (
    <>
      <div hidden={top !== undefined} className="h-full overflow-y-auto">
        <tab.Content open={open} />
      </div>
      {stack.map(({ key, page }) => (
        <div key={key} hidden={key !== top?.key} className="flex h-full flex-col">
          <div className="border-b px-2 py-1">
            <Button variant="ghost" size="sm" aria-label={labels.backTo(tab.label)} onClick={back}>
              <ChevronLeft data-icon="inline-start" />
              {tab.label}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <PageView page={page} open={open} />
          </div>
        </div>
      ))}
    </>
  )
}

function PanelTabs({ state, select, open, back }: { state: PanelState } & Navigate) {
  return (
    <Tabs
      value={state.tab}
      onValueChange={value => isPanelTab(value) && select(value)}
      className="min-h-0 flex-1 gap-0"
    >
      {tabs.map(tab => (
        <TabsContent key={tab.id} value={tab.id} keepMounted className="min-h-0">
          <TabStack tab={tab} stack={state.stacks[tab.id]} open={open} back={back} />
        </TabsContent>
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

export function SidePanel({ host, data }: { host: PanelHost; data: DataState | null }) {
  const { state, ...navigate } = usePanelNavigation(host)
  return (
    <div className="flex h-dvh min-w-0 flex-col">
      <PanelHeader openSettings={host.openSettings} />
      {isWaitingForData(data) ? (
        <div data-dictionary-progress className="min-h-0 flex-1 overflow-y-auto p-4">
          <DictionaryProgress data={data} />
        </div>
      ) : (
        state && <PanelTabs state={state} {...navigate} />
      )}
    </div>
  )
}
