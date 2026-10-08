'use client'

import { ArrowRightIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { ConverterBox } from '@/components/tools/converter-box'
import { ConverterSettings } from '@/components/tools/converter-settings'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { bothSides, defaultConverterOptions, type Edit } from '@/lib/tools/convert'
import { converterFor, languageOf } from '@/lib/tools/converters'
import type { ConverterSlug } from '@/lib/tools/paths'

export function Converter({ slug }: { slug: ConverterSlug }) {
  const converter = converterFor(slug)
  const [options, setOptions] = useState(defaultConverterOptions)
  const [edit, setEdit] = useState<Edit>({ side: 'from', text: converter.sample })
  const sides = bothSides(slug, edit, options)
  const fromField = useRef<HTMLTextAreaElement>(null)

  return (
    <Card className="gap-0 py-0">
      <div className="muted-surface flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b bg-muted/40 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {converter.from}
          <ArrowRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          <span className="sr-only">to</span>
          {converter.to}
        </p>
        {converter.setting ? (
          <ConverterSettings setting={converter.setting} options={options} onChange={setOptions} />
        ) : null}
      </div>
      <ConverterBox
        label={converter.from}
        lang={languageOf[converter.input]}
        text={sides.from}
        onType={text => setEdit({ side: 'from', text })}
        placeholder="Type or paste here"
        fieldRef={fromField}
        actions={
          <Button
            variant="ghost"
            onClick={() => {
              setEdit({ side: 'from', text: '' })
              fromField.current?.focus()
            }}
          >
            Clear
          </Button>
        }
      />
      <ConverterBox
        label={converter.to}
        lang={languageOf[converter.output]}
        text={sides.to}
        onType={text => setEdit({ side: 'to', text })}
        placeholder="The result shows here, or type here to convert back"
        className="muted-surface border-t bg-muted/40"
        fieldClassName="text-lg md:text-lg"
      />
      <fieldset className="flex flex-wrap items-center gap-1.5 border-t px-4 py-3 text-sm text-muted-foreground">
        <legend className="sr-only">Try an example</legend>
        <span aria-hidden="true">Try</span>
        {converter.tries.map(example => (
          <Button
            key={example}
            variant="outline"
            size="sm"
            lang={languageOf[converter.input]}
            onClick={() => setEdit({ side: 'from', text: example })}
          >
            {example}
          </Button>
        ))}
      </fieldset>
    </Card>
  )
}
