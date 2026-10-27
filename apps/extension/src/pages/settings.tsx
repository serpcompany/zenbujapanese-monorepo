import { labels } from '../shared/labels'
import { mountPage, PageShell } from './mount-page'

mountPage(
  `${labels.settings.title} · ${labels.name}`,
  <div className="mx-auto max-w-2xl">
    <PageShell title={labels.settings.title}>
      <p className="text-sm text-muted-foreground">{labels.settings.body}</p>
    </PageShell>
  </div>
)
