import { Button } from '@zenbu/ui/components/button'
import { useCallback, useEffect, useState } from 'react'
import { japaneseToEnglish } from '../translation/direction'
import type { TranslatorState } from '../translation/messages'
import { downloadTranslator, translatorAvailability } from '../translation/translator'
import { labels } from './labels'

export type ModelState =
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'downloadable' }
  | { state: 'downloading'; fraction: number }
  | { state: 'download-failed' }
  | { state: 'unavailable' }

export type ModelServices = {
  availability(): Promise<TranslatorState>
  download(onProgress: (fraction: number) => void): Promise<TranslatorState>
}

export const chromeModel: ModelServices = {
  availability: () => translatorAvailability(japaneseToEnglish),
  download: onProgress => downloadTranslator(japaneseToEnglish, onProgress)
}

const checking: ModelState = { state: 'checking' }

export function modelIn(state: TranslatorState): ModelState {
  if (state === 'available') return { state: 'available' }
  if (state === 'unavailable') return { state: 'unavailable' }
  return { state: 'downloadable' }
}

function afterDownload(state: TranslatorState): ModelState {
  if (state === 'available' || state === 'unavailable') return modelIn(state)
  return { state: 'download-failed' }
}

export function useTranslationModel(on: boolean, services: ModelServices) {
  const [model, setModel] = useState<ModelState>(checking)
  useEffect(() => {
    if (!on) return
    let live = true
    Promise.resolve()
      .then(() => services.availability())
      .then(modelIn, (): ModelState => ({ state: 'unavailable' }))
      .then(next => {
        if (live) setModel(next)
      })
    return () => {
      live = false
    }
  }, [on, services])
  const download = useCallback(() => {
    setModel({ state: 'downloading', fraction: 0 })
    Promise.resolve()
      .then(() => services.download(fraction => setModel({ state: 'downloading', fraction })))
      .then(afterDownload, (): ModelState => ({ state: 'download-failed' }))
      .then(setModel)
  }, [services])
  return { model, setModel, download }
}

const noteClass = 'text-sm text-muted-foreground'

export function DownloadProgress({ fraction }: { fraction: number }) {
  return (
    <div className="flex w-full flex-col gap-2">
      <p className={noteClass}>{labels.translation.downloading(fraction)}</p>
      <progress
        value={fraction}
        max={1}
        className="h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
      />
    </div>
  )
}

type ModelNoticeText = { asks: string; ready?: string; unavailable?: string }

type ModelNoticeProps = {
  model: ModelState
  download(): void
  text: ModelNoticeText
  stacked?: boolean
}

export function ModelNotice({ model, download, text, stacked = false }: ModelNoticeProps) {
  if (model.state === 'checking') return null
  if (model.state === 'downloading') return <DownloadProgress fraction={model.fraction} />
  if (model.state === 'available' || model.state === 'unavailable') {
    const said = model.state === 'available' ? text.ready : text.unavailable
    return said ? (
      <p data-translation-model={model.state} className={noteClass}>
        {said}
      </p>
    ) : null
  }
  return (
    <div
      data-translation-model={model.state}
      className={
        stacked ? 'flex flex-col items-center gap-3' : 'flex items-center justify-between gap-3'
      }
    >
      <p className={noteClass}>
        {model.state === 'downloadable' ? text.asks : labels.translation.downloadFailed}
      </p>
      <Button
        variant={stacked ? 'default' : 'outline'}
        size={stacked ? 'default' : 'sm'}
        onClick={download}
      >
        {labels.translation.download}
      </Button>
    </div>
  )
}
