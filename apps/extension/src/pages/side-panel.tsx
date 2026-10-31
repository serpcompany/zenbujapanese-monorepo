import { useDataState } from '../shared/dictionary-progress'
import { labels } from '../shared/labels'
import { SidePanel } from '../side-panel/panel'
import { chromePanelHost } from '../side-panel/panel-host'
import { syncWhenOpened } from '../side-panel/sync-when-opened'
import { mountPage } from './mount-page'

function SidePanelPage() {
  const [data, again] = useDataState()
  return <SidePanel host={chromePanelHost} data={data} again={again} />
}

mountPage(labels.name, <SidePanelPage />)
syncWhenOpened()
