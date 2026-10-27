import { DictionaryStatus } from '../shared/dictionary-status'
import { labels } from '../shared/labels'
import { TranslateTab } from '../translate/translate-tab'
import { mountPage, PageShell } from './mount-page'

mountPage(
  labels.sidePanel.title,
  <PageShell title={labels.sidePanel.title}>
    <DictionaryStatus />
    <TranslateTab />
  </PageShell>
)
