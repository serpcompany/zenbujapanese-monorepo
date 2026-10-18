'use client'

import { CopyIcon } from 'lucide-react'
import { type ReactNode, type Ref, useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { fill, pluralOf } from '@/lib/i18n/format'

const copyStatusShown = 2_000

type BoxText = Pick<
  Dictionary['tools']['converter'],
  'copy' | 'copyLabel' | 'copied' | 'selectToCopy' | 'characters'
>

const characterCount = (text: string, words: BoxText, locale: Locale) => {
  const count = Array.from(text).length
  return fill(pluralOf(words.characters, count, locale), { count })
}

function useCopy(words: BoxText) {
  const [status, setStatus] = useState('')
  const clearing = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(clearing.current), [])
  const copy = async (text: string) => {
    clearTimeout(clearing.current)
    try {
      await navigator.clipboard.writeText(text)
      setStatus(words.copied)
    } catch {
      setStatus(words.selectToCopy)
    }
    clearing.current = setTimeout(() => setStatus(''), copyStatusShown)
  }
  return { status, copy }
}

export function ConverterBox({
  label,
  lang,
  text,
  onType,
  placeholder,
  words,
  locale,
  fieldRef,
  actions
}: {
  label: string
  lang: string
  text: string
  onType: (text: string) => void
  placeholder: string
  words: BoxText
  locale: Locale
  fieldRef?: Ref<HTMLTextAreaElement>
  actions?: ReactNode
}) {
  const id = useId()
  const { status, copy } = useCopy(words)
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        ref={fieldRef}
        id={id}
        lang={lang}
        value={text}
        onChange={event => onType(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{characterCount(text, words, locale)}</span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <output>{status}</output>
          {actions}
          <Button
            variant="outline"
            onClick={() => copy(text)}
            disabled={!text}
            aria-label={fill(words.copyLabel, { label })}
          >
            <CopyIcon data-icon="inline-start" aria-hidden="true" />
            {words.copy}
          </Button>
        </div>
      </div>
    </div>
  )
}
