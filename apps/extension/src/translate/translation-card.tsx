import { Button } from '@zenbu/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader
} from '@zenbu/ui/components/card'
import { useState, useSyncExternalStore } from 'react'
import type { Direction } from '../translation/messages'
import { translateLabels } from './labels'
import type { TranslateServices } from './services'
import { SourceWords } from './source-words'

export type Translated = { source: string; translation: string; direction: Direction }

type CardServices = Pick<
  TranslateServices,
  'copy' | 'speak' | 'localVoice' | 'watchVoices' | 'segment' | 'wait' | 'popupCard' | 'pagePopup'
>

export function TranslationCard({
  translated: { source, translation, direction },
  services
}: {
  translated: Translated
  services: CardServices
}) {
  const [copied, setCopied] = useState(false)
  const voice = useSyncExternalStore(services.watchVoices, () => services.localVoice(direction.to))
  const copy = () =>
    services.copy(translation).then(
      () => setCopied(true),
      () => undefined
    )

  return (
    <Card data-translation-card>
      <CardHeader>
        <CardDescription data-direction>{translateLabels.direction(direction)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {direction.from === 'ja' ? (
          <SourceWords source={source} services={services} />
        ) : (
          <p
            lang={direction.from}
            data-source
            className="whitespace-pre-wrap text-muted-foreground"
          >
            {source}
          </p>
        )}
        <p lang={direction.to} data-translation className="whitespace-pre-wrap text-base">
          {translation}
        </p>
        {voice === null && (
          <p data-no-voice className="text-xs text-muted-foreground">
            {translateLabels.noVoice(direction.to)}
          </p>
        )}
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <span className="text-xs text-muted-foreground">{translateLabels.onThisDevice}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? translateLabels.copied : translateLabels.copy}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={voice === null}
            onClick={() => services.speak(translation, direction.to)}
          >
            {translateLabels.speak}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
