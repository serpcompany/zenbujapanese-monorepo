import { Button } from '@zenbu/ui/components/button'
import { Credits } from '../shared/credits'
import { DataStatus, useDataState } from '../shared/data-status'
import { labels } from '../shared/labels'
import { mountPage, PageShell } from './mount-page'

function LanguageData() {
  const { data, update } = useDataState()
  const busy = data.state === 'checking' || data.state === 'updating'
  return (
    <div className="flex flex-col items-start gap-3">
      <DataStatus data={data} />
      <Button variant="outline" onClick={update} disabled={busy}>
        {busy ? labels.settings.checkingForUpdates : labels.settings.checkForUpdates}
      </Button>
    </div>
  )
}

mountPage(
  `${labels.settings.title} · ${labels.name}`,
  <div className="mx-auto max-w-2xl">
    <PageShell title={labels.settings.title}>
      <LanguageData />
      <Credits />
    </PageShell>
  </div>
)
