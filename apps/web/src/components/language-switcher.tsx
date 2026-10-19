'use client'

import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { type ComponentProps, useState } from 'react'
import { Flag } from '@/components/flag'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { Switcher } from '@/lib/i18n/switcher'

const xDefault = 'x-default'

function alternatePaths(): ReadonlyMap<string, string> {
  const paths = new Map<string, string>()
  if (typeof document === 'undefined') return paths
  for (const link of document.querySelectorAll<HTMLLinkElement>(
    'link[rel="alternate"][hreflang]'
  )) {
    const hreflang = link.getAttribute('hreflang')
    if (!hreflang || hreflang === xDefault) continue
    const url = new URL(link.href, window.location.href)
    paths.set(hreflang, `${url.pathname}${url.search}`)
  }
  return paths
}

function LanguageLink(props: ComponentProps<'a'>) {
  return <a {...props} />
}

function LanguageItems({ current, languages }: Pick<Switcher, 'current' | 'languages'>) {
  const [paths] = useState(alternatePaths)
  return languages.map(language =>
    language.code === current ? (
      <DropdownMenuItem key={language.code} lang={language.code} aria-current="true">
        <Flag region={language.region} />
        {language.name}
        <CheckIcon aria-hidden="true" className="ml-auto" />
      </DropdownMenuItem>
    ) : (
      <DropdownMenuItem
        key={language.code}
        render={
          <LanguageLink
            href={paths.get(language.code) ?? language.home}
            hrefLang={language.code}
            lang={language.code}
          />
        }
      >
        <Flag region={language.region} />
        {language.name}
      </DropdownMenuItem>
    )
  )
}

export function LanguageMenu({
  current,
  languages,
  label,
  className,
  side = 'bottom'
}: Switcher & { className?: string; side?: 'bottom' | 'top' }) {
  const shown = languages.find(language => language.code === current)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="lg"
            className={className}
            aria-label={shown ? `${shown.short}, ${label}` : label}
          />
        }
      >
        {shown ? <Flag region={shown.region} /> : null}
        {shown?.short}
        <ChevronDownIcon data-icon="inline-end" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={side} className="w-40">
        <LanguageItems current={current} languages={languages} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
