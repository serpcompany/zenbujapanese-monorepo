import { labels } from '../shared/labels'
import { mountPage, PageShell } from './mount-page'

mountPage(
  labels.popup.title,
  <div className="w-80">
    <PageShell title={labels.popup.title}>
      <p className="text-sm text-muted-foreground">{labels.popup.body}</p>
    </PageShell>
  </div>
)
