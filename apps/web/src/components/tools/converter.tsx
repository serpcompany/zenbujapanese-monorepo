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
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Type in either box</h2>
        </CardTitle>
        <CardDescription>The other box converts as you type.</CardDescription>
        {converter.setting === 'script' ? (
          <CardAction>
            <ScriptSetting options={options} onChange={setOptions} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {converter.setting === 'widths' ? (
          <WidthSettings options={options} onChange={setOptions} />
        ) : null}
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
        />
      </CardContent>
      <CardFooter>
        <fieldset className="flex flex-wrap items-center gap-2 text-sm">
          <legend className="sr-only">Try an example</legend>
          <span aria-hidden="true" className="font-medium">
            Try
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
