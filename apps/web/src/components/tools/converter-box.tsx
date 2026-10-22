'use client'

import { CopyIcon } from 'lucide-react'
import { type ReactNode, type Ref, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type CopyText, useCopy } from '@/hooks/use-copy'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { fill, pluralOf } from '@/lib/i18n/format'

export type BoxText = CopyText &
  Pick<Dictionary['tools']['converter'], 'copy' | 'copyLabel' | 'characters'>

const characterCount = (text: string, words: BoxText, locale: Locale) => {
  const count = Array.from(text).length
  return fill(pluralOf(words.characters, count, locale), { count })
}

export function BoxFooter({ count, children }: { count: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{count}</span>
      <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  )
}

export function CopyButton({
  label,
  words,
  disabled,
  onCopy
}: {
  label: string
  words: BoxText
  disabled: boolean
  onCopy: () => void
}) {
  return (
    <Button
      variant="outline"
      onClick={onCopy}
      disabled={disabled}
      aria-label={fill(words.copyLabel, { label })}
    >
      <CopyIcon data-icon="inline-start" aria-hidden="true" />
      {words.copy}
    </Button>
  )
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
  actions,
  count,
  invalid,
  copies = true
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
  count?: string
  invalid?: boolean
  copies?: boolean
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
        aria-invalid={invalid || undefined}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
      />
      <BoxFooter count={count ?? characterCount(text, words, locale)}>
        <output>{status}</output>
        {actions}
        {copies ? (
          <CopyButton
            label={label}
            words={words}
            disabled={!text}
            onCopy={() => copy(() => navigator.clipboard.writeText(text))}
          />
        ) : null}
      </BoxFooter>
    </div>
  )
}
