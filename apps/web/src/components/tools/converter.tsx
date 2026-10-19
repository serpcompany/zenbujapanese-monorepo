'use client'

import { useRef, useState } from 'react'
import { ConverterBox } from '@/components/tools/converter-box'
import { ScriptSetting, WidthSettings } from '@/components/tools/converter-settings'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { bothSides, defaultConverterOptions, type Edit } from '@/lib/tools/convert'
import { converterFor, languageOf } from '@/lib/tools/converters'
import type { ConverterSlug } from '@/lib/tools/paths'

export type ConverterText = Dictionary['tools']['converter']

export function Converter({
  slug,
  from,
  to,
  text,
  locale
}: {
  slug: ConverterSlug
  from: string
  to: string
  text: ConverterText
  locale: Locale
}) {
  const converter = converterFor(slug)
  const [options, setOptions] = useState(defaultConverterOptions)
  const [edit, setEdit] = useState<Edit>({ side: 'from', text: converter.sample })
  const sides = bothSides(slug, edit, options)
  const fromField = useRef<HTMLTextAreaElement>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{text.heading}</h2>
        </CardTitle>
        <CardDescription>{text.line}</CardDescription>
        {converter.setting === 'script' ? (
          <CardAction>
            <ScriptSetting options={options} onChange={setOptions} text={text} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {converter.setting === 'widths' ? (
          <WidthSettings options={options} onChange={setOptions} text={text} />
        ) : null}
        <ConverterBox
          label={from}
          lang={languageOf[converter.input]}
          text={sides.from}
          onType={typed => setEdit({ side: 'from', text: typed })}
          placeholder={text.fromPlaceholder}
          words={text}
          locale={locale}
          fieldRef={fromField}
          actions={
            <Button
              variant="ghost"
              onClick={() => {
                setEdit({ side: 'from', text: '' })
                fromField.current?.focus()
              }}
            >
              {text.clear}
            </Button>
          }
        />
        <ConverterBox
          label={to}
          lang={languageOf[converter.output]}
          text={sides.to}
          onType={typed => setEdit({ side: 'to', text: typed })}
          placeholder={text.toPlaceholder}
          words={text}
          locale={locale}
        />
      </CardContent>
      <CardFooter>
        <fieldset className="flex flex-wrap items-center gap-2 text-sm">
          <legend className="sr-only">{text.examples}</legend>
          <span aria-hidden="true" className="font-medium">
            {text.try}
          </span>
          {converter.tries.map(example => (
            <Button
              key={example}
              variant="outline"
              lang={languageOf[converter.input]}
              onClick={() => setEdit({ side: 'from', text: example })}
            >
              {example}
            </Button>
          ))}
        </fieldset>
      </CardFooter>
    </Card>
  )
}
