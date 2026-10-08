'use client'

import { CopyIcon } from 'lucide-react'
import { type ReactNode, type Ref, useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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

export function ConverterBox({
  label,
  lang,
  text,
  onType,
  placeholder,
  fieldRef,
  actions,
  className,
  fieldClassName
}: {
  label: string
  lang: string
  text: string
  onType: (text: string) => void
  placeholder: string
  fieldRef?: Ref<HTMLTextAreaElement>
  actions?: ReactNode
  className?: string
  fieldClassName?: string
}) {
  const id = useId()
  const { status, copy } = useCopy()
  return (
    <div className={cn('flex flex-col gap-2 p-4', className)}>
      <label htmlFor={id} className="text-sm font-medium text-muted-foreground">
        {label}
      </label>
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
        className={cn('min-h-24', fieldClassName)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{characterCount(text)}</span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <output>{status}</output>
          {actions}
          <Button
            variant="outline"
            onClick={() => copy(text)}
            disabled={!text}
            aria-label={`Copy ${label}`}
          >
            <CopyIcon data-icon="inline-start" aria-hidden="true" />
            Copy
          </Button>
        </div>
      </div>
    </div>
  )
}
