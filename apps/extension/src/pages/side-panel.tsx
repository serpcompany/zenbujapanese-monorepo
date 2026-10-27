import { useDataState } from '../shared/dictionary-progress'
import { labels } from '../shared/labels'
import { SidePanel } from '../side-panel/panel'
import { chromePanelHost } from '../side-panel/panel-host'
import { mountPage } from './mount-page'

function SidePanelPage() {
  const [data] = useDataState()
  return <SidePanel host={chromePanelHost} data={data} />
}

mountPage(labels.name, <SidePanelPage />)
