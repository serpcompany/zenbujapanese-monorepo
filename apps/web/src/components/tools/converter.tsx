'use client'

import { ArrowLeftRightIcon, CopyIcon } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { ConverterSettings } from '@/components/tools/converter-settings'
import { useConverterTexts } from '@/components/tools/converter-texts'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { convert, defaultConverterOptions } from '@/lib/tools/convert'
import { converterFor, languageOf } from '@/lib/tools/converters'
import type { ConverterSlug } from '@/lib/tools/paths'
import { cn } from '@/lib/utils'

const copyStatusShown = 2_000

const characterCount = (text: string) => {
  const count = Array.from(text).length
  return count === 1 ? '1 character' : `${count} characters`
}

function useCopy() {
  const [status, setStatus] = useState('')
  const clearing = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(clearing.current), [])
  const copy = async (text: string) => {
    clearTimeout(clearing.current)
    try {
      await navigator.clipboard.writeText(text)
      setStatus('Copied')
    } catch {
      setStatus('Select the text to copy it')
    }
    clearing.current = setTimeout(() => setStatus(''), copyStatusShown)
  }
  return { status, copy }
}

export function Converter({ slug }: { slug: ConverterSlug }) {
  const converter = converterFor(slug)
  const reverse = converterFor(converter.reverse)
  const { texts, write } = useConverterTexts()
  const [options, setOptions] = useState(defaultConverterOptions)
  const { status, copy } = useCopy()
  const input = texts[slug] ?? converter.sample
  const output = convert(slug, input, options)
  const inputId = useId()
  const outputLabelId = useId()
  const field = useRef<HTMLTextAreaElement>(null)

  return (
    <Card className="gap-0 py-0">
      <div className="muted-surface flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span>{converter.from}</span>
          <Link
            href={reverse.path}
            scroll={false}
            onNavigate={() => write(reverse.slug, output)}
            aria-label={`Switch to ${reverse.name}`}
            title={`Switch to ${reverse.name}`}
            className={buttonVariants({ variant: 'outline', size: 'icon-sm' })}
          >
            <ArrowLeftRightIcon aria-hidden="true" />
          </Link>
          <span>{converter.to}</span>
        </div>
        {converter.setting ? (
          <ConverterSettings setting={converter.setting} options={options} onChange={setOptions} />
        ) : null}
      </div>
      <div className="flex flex-col gap-2 p-4">
        <label htmlFor={inputId} className="text-sm font-medium text-muted-foreground">
          {converter.from}
        </label>
        <Textarea
          ref={field}
          id={inputId}
          lang={languageOf[converter.input]}
          value={input}
          onChange={event => write(slug, event.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          className="min-h-28 text-lg md:text-lg"
        />
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{characterCount(input)}</span>
          <Button
            variant="ghost"
            onClick={() => {
              write(slug, '')
              field.current?.focus()
            }}
          >
            Clear
          </Button>
        </div>
      </div>
      <div className="muted-surface flex flex-col gap-2 border-t bg-muted/40 p-4">
        <span id={outputLabelId} className="text-sm font-medium text-muted-foreground">
          {converter.to}
        </span>
        <output
          htmlFor={inputId}
          aria-labelledby={outputLabelId}
          lang={output ? languageOf[converter.output] : undefined}
          className={cn(
            'min-h-24 text-2xl leading-relaxed wrap-anywhere whitespace-pre-wrap',
            !output && 'text-muted-foreground'
          )}
        >
          {output || 'The result shows here.'}
        </output>
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <output>{status}</output>
          <Button variant="outline" onClick={() => copy(output)} disabled={!output}>
            <CopyIcon data-icon="inline-start" aria-hidden="true" />
            Copy
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t px-4 py-3 text-sm text-muted-foreground">
        <span>Try</span>
        {converter.tries.map(example => (
          <Button
            key={example}
            variant="outline"
            size="sm"
            lang={languageOf[converter.input]}
            className="rounded-full px-3 text-sm text-foreground"
            onClick={() => write(slug, example)}
          >
            {example}
          </Button>
        ))}
      </div>
    </Card>
  )
}
