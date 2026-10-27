'use client'

import { maximumSegmentedLength } from '@zenbu/dictionary-core/cards/segmentable'
import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'
import { useId, useRef, useState } from 'react'
import { RubyText } from '@/components/dictionary/ruby-text'
import { BoxFooter, ConverterBox, CopyButton } from '@/components/tools/converter-box'
import { ClearButton, ConverterHeader, TryExamples } from '@/components/tools/converter-parts'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useCopy } from '@/hooks/use-copy'
import { type FuriganaStatus, useFurigana } from '@/hooks/use-furigana'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { fill, pluralOf } from '@/lib/i18n/format'
import {
  composedText,
  type FuriganaSample,
  furiganaHtml,
  furiganaPlainText
} from '@/lib/tools/furigana-tool'

type FuriganaText = Dictionary['tools']['furigana']

async function writeFurigana(furigana: readonly RubySegment[]) {
  const plain = furiganaPlainText(furigana)
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard.write) {
    await navigator.clipboard.writeText(plain)
    return
  }
  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': new Blob([furiganaHtml(furigana)], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' })
    })
  ])
}

export function FuriganaConverter({
  sample,
  tries,
  text,
  words,
  locale
}: {
  sample: FuriganaSample
  tries: readonly string[]
  text: FuriganaText
  words: Dictionary['tools']['converter']
  locale: Locale
}) {
  const [typed, setTyped] = useState(sample.text)
  const field = useRef<HTMLTextAreaElement>(null)
  const resultId = useId()
  const { shown, status, retry } = useFurigana(typed, sample)
  const copied = useCopy(words)
  const characters = Array.from(composedText(typed)).length
  const said: Record<FuriganaStatus, string> = {
    shown: '',
    empty: '',
    reading: text.reading,
    failed: text.unavailable,
    tooLong: fill(text.tooLong, { limit: maximumSegmentedLength })
  }

  return (
    <Card>
      <ConverterHeader heading={text.heading} line={text.line} />
      <CardContent className="flex flex-col gap-6">
        <ConverterBox
          label={text.input}
          lang="ja"
          text={typed}
          onType={setTyped}
          placeholder={text.placeholder}
          words={words}
          locale={locale}
          fieldRef={field}
          count={fill(pluralOf(text.count, characters, locale), {
            count: characters,
            limit: maximumSegmentedLength
          })}
          invalid={status === 'tooLong'}
          copies={false}
          actions={<ClearButton label={words.clear} field={field} onClear={() => setTyped('')} />}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor={resultId}>{text.output}</Label>
          <output
            id={resultId}
            aria-live="off"
            aria-busy={status === 'reading'}
            className="min-h-16 rounded-lg border px-2.5 py-2 text-base leading-loose whitespace-pre-wrap md:text-sm"
          >
            {shown ? (
              <RubyText segments={shown.furigana} />
            ) : (
              <span className="text-muted-foreground">{text.empty}</span>
            )}
          </output>
          <BoxFooter count={<output>{said[status]}</output>}>
            <output>{copied.status}</output>
            {status === 'failed' ? (
              <Button variant="outline" onClick={retry}>
                {text.retry}
              </Button>
            ) : null}
            <CopyButton
              label={text.output}
              words={words}
              disabled={!shown}
              onCopy={() => {
                if (shown) copied.copy(() => writeFurigana(shown.furigana))
              }}
            />
          </BoxFooter>
        </div>
      </CardContent>
      <TryExamples examples={tries} lang="ja" words={words} onTry={setTyped} />
    </Card>
  )
}
