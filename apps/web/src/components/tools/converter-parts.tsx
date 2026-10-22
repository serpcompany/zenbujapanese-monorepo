import type { ReactNode, RefObject } from 'react'
import { Button } from '@/components/ui/button'
import {
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import type { Dictionary } from '@/lib/i18n/dictionary'

export function ConverterHeader({
  heading,
  line,
  action
}: {
  heading: string
  line: string
  action?: ReactNode
}) {
  return (
    <CardHeader>
      <CardTitle>
        <h2>{heading}</h2>
      </CardTitle>
      <CardDescription>{line}</CardDescription>
      {action ? <CardAction>{action}</CardAction> : null}
    </CardHeader>
  )
}

export function TryExamples({
  examples,
  lang,
  words,
  onTry
}: {
  examples: readonly string[]
  lang: string
  words: Pick<Dictionary['tools']['converter'], 'examples' | 'try'>
  onTry: (example: string) => void
}) {
  return (
    <CardFooter>
      <fieldset className="flex flex-wrap items-center gap-2 text-sm">
        <legend className="sr-only">{words.examples}</legend>
        <span aria-hidden="true" className="font-medium">
          {words.try}
        </span>
        {examples.map(example => (
          <Button key={example} variant="outline" lang={lang} onClick={() => onTry(example)}>
            {example}
          </Button>
        ))}
      </fieldset>
    </CardFooter>
  )
}

export function ClearButton({
  label,
  field,
  onClear
}: {
  label: string
  field: RefObject<HTMLTextAreaElement | null>
  onClear: () => void
}) {
  return (
    <Button
      variant="ghost"
      onClick={() => {
        onClear()
        field.current?.focus()
      }}
    >
      {label}
    </Button>
  )
}
