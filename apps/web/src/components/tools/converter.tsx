'use client'

import { useRef, useState } from 'react'
import { ConverterBox } from '@/components/tools/converter-box'
import { ClearButton, ConverterHeader, TryExamples } from '@/components/tools/converter-parts'
import { ScriptSetting, WidthSettings } from '@/components/tools/converter-settings'
import { Card, CardContent } from '@/components/ui/card'
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
      <ConverterHeader
        heading={text.heading}
        line={text.line}
        action={
          converter.setting === 'script' ? (
            <ScriptSetting options={options} onChange={setOptions} text={text} />
          ) : null
        }
      />
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
            <ClearButton
              label={text.clear}
              field={fromField}
              onClear={() => setEdit({ side: 'from', text: '' })}
            />
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
      <TryExamples
        examples={converter.tries}
        lang={languageOf[converter.input]}
        words={text}
        onTry={example => setEdit({ side: 'from', text: example })}
      />
    </Card>
  )
}
