import { Button } from '@zenbu/ui/components/button'
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from '@zenbu/ui/components/item'
import { Textarea } from '@zenbu/ui/components/textarea'
import { ChevronRight, ScanText } from 'lucide-react'
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

function ResultView({ result, services }: { result: Result; services: TranslateServices }) {
  switch (result.state) {
    case 'translating':
      return <p className="text-sm text-muted-foreground">{translateLabels.translating}</p>
    case 'downloading':
      return <DownloadProgress fraction={result.fraction} />
    case 'translated':
      return <TranslationCard key={result.id} translated={result.translated} services={services} />
    case 'notice':
      return <NoticeText notice={result.notice} />
    default:
      return null
  }
}

type TranslateTabProps = Partial<PanelTabProps> & { services?: TranslateServices }

function ImageRow({ open }: { open: PanelTabProps['open'] }) {
  return (
    <Item
      variant="outline"
      render={<button type="button" onClick={() => open({ page: 'image-search' })} />}
      className="w-full cursor-pointer text-left"
    >
      <ItemMedia variant="icon">
        <ScanText />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{translateLabels.image}</ItemTitle>
      </ItemContent>
      <ItemActions>
        <ChevronRight className="size-4 text-muted-foreground" />
      </ItemActions>
    </Item>
  )
}

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
      {open && <ImageRow open={open} />}
      {selectionNotice && <NoticeText notice={selectionNotice} />}
      <div aria-live="polite">
        <ResultView result={result} services={services} />
      </div>
    </section>
  )
}
