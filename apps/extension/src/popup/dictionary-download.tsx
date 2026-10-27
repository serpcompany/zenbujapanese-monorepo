import { Button } from '@zenbu/ui/components/button'
import { openWelcomeTab } from '../shared/dictionary'
import { DictionaryProgress, useDataState } from '../shared/dictionary-progress'
import { popupLabels } from './labels'

export function DictionaryDownload() {
  const [data] = useDataState()
  if (data?.state !== 'downloading') return null
  return (
    <section data-dictionary-download className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{popupLabels.download.title}</h2>
      <DictionaryProgress data={data} />
      <Button variant="outline" onClick={() => openWelcomeTab()}>
        {popupLabels.download.showWelcome}
      </Button>
    </section>
  )
}
