import { Button } from '@zenbu/ui/components/button'
import { Textarea } from '@zenbu/ui/components/textarea'
import { useRef, useState } from 'react'
import { DownloadProgress } from '../shared/translation-model'
import type { PanelTabProps } from '../side-panel/route'
import { translateLabels } from './labels'
import { onDeviceServices, type TranslateServices } from './services'
import { TranslationCard } from './translation-card'
import { type Notice, type Result, useTranslation } from './use-translation'

function NoticeText({ notice }: { notice: Notice }) {
  return (
    <p data-notice={notice} className="text-sm text-muted-foreground">
      {translateLabels.notices[notice]}
    </p>
  )
}

function ResultView({
  result,
  services,
  open
}: {
  result: Result
  services: TranslateServices
  open?: PanelTabProps['open']
}) {
  switch (result.state) {
    case 'translating':
      return <p className="text-sm text-muted-foreground">{translateLabels.translating}</p>
    case 'downloading':
      return <DownloadProgress fraction={result.fraction} />
    case 'translated':
      return (
        <TranslationCard
          key={result.id}
          translated={result.translated}
          services={services}
          open={open}
        />
      )
    case 'notice':
      return <NoticeText notice={result.notice} />
    default:
      return null
  }
}

type TranslateTabProps = Partial<PanelTabProps> & { services?: TranslateServices }

export function TranslateTab({ services = onDeviceServices, open }: TranslateTabProps) {
  const [text, setText] = useState('')
  const [selectionNotice, setSelectionNotice] = useState<Notice | null>(null)
  const { result, translate, clear } = useTranslation(services)
  const box = useRef<HTMLTextAreaElement>(null)
  const busy = result.state === 'translating' || result.state === 'downloading'

  function change(value: string) {
    setText(value)
    setSelectionNotice(null)
    if (value.trim() === '') clear()
  }

  async function takeSelection() {
    const selected = await services.readSelection()
    if (selected === null) return setSelectionNotice('selectionUnreadable')
    if (selected === '') return setSelectionNotice('nothingSelected')
    setSelectionNotice(null)
    setText(selected)
  }

  function clearAll() {
    change('')
    box.current?.focus()
  }

  return (
    <section className="flex flex-col gap-3 p-4">
      <Textarea
        ref={box}
        aria-label={translateLabels.box}
        placeholder={translateLabels.placeholder}
        value={text}
        onChange={event => change(event.target.value)}
        className="min-h-28"
      />
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={takeSelection}>
          {translateLabels.useSelection}
        </Button>
        <Button variant="ghost" onClick={clearAll}>
          {translateLabels.clear}
        </Button>
        <Button className="ml-auto" disabled={busy} onClick={() => translate(text)}>
          {translateLabels.translate}
        </Button>
      </div>
      {selectionNotice && <NoticeText notice={selectionNotice} />}
      <div aria-live="polite">
        <ResultView result={result} services={services} open={open} />
      </div>
    </section>
  )
}
