import { Button } from '@zenbu/ui/components/button'
import { useDataState } from '../shared/data-status'
import { labels } from '../shared/labels'
import { welcomePage } from '../shared/language-data'
import { mountPage, PageShell } from './mount-page'

function ShowWelcomeTab() {
  const { data } = useDataState()
  if (data.state === 'ready' || data.state === 'updating') return null
  return (
    <Button
      variant="outline"
      onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL(welcomePage) })}
    >
      {labels.popup.showWelcome}
    </Button>
  )
}

mountPage(
  labels.popup.title,
  <div className="w-80">
    <PageShell title={labels.popup.title}>
      <p className="text-sm text-muted-foreground">{labels.popup.body}</p>
      <ShowWelcomeTab />
    </PageShell>
  </div>
)
