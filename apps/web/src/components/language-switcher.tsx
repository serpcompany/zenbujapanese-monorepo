'use client'

import { CheckIcon, LanguagesIcon } from 'lucide-react'
import { type ComponentProps, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { Switcher, SwitcherLanguage } from '@/lib/i18n/switcher'
import { cn } from '@/lib/utils'

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

function useLanguageLinks(languages: readonly SwitcherLanguage[]) {
  const [paths] = useState(alternatePaths)
  return languages.map(language => ({
    ...language,
    href: paths.get(language.code) ?? language.home
  }))
}

function LanguageLink(props: ComponentProps<'a'>) {
  return <a {...props} />
}

function LanguageItems({ current, languages }: Pick<Switcher, 'current' | 'languages'>) {
  return useLanguageLinks(languages).map(language =>
    language.code === current ? (
      <DropdownMenuItem key={language.code} lang={language.code} aria-current="true">
        {language.name}
        <CheckIcon aria-hidden="true" className="ml-auto" />
      </DropdownMenuItem>
    ) : (
      <DropdownMenuItem
        key={language.code}
        render={<LanguageLink href={language.href} hrefLang={language.code} lang={language.code} />}
      >
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
  const name = languages.find(language => language.code === current)?.name
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="lg" className={className} aria-label={label} />}
      >
        <LanguagesIcon data-icon="inline-start" aria-hidden="true" />
        {name}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={side} className="w-40">
        <LanguageItems current={current} languages={languages} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function LanguageList({
  current,
  languages,
  heading,
  className
}: Switcher & { className?: string }) {
  const links = useLanguageLinks(languages)
  return (
    <nav aria-label={heading} className={cn('flex flex-col gap-1', className)}>
      <p className="flex items-center gap-2 px-2 text-sm font-medium text-muted-foreground">
        <LanguagesIcon aria-hidden="true" className="size-4" />
        {heading}
      </p>
      <ul className="flex flex-wrap gap-1">
        {links.map(language => (
          <li key={language.code}>
            {language.code === current ? (
              <span
                lang={language.code}
                aria-current="true"
                className="flex items-center gap-1.5 rounded-lg bg-muted p-2 text-sm"
              >
                {language.name}
                <CheckIcon aria-hidden="true" className="size-4" />
              </span>
            ) : (
              <a
                href={language.href}
                hrefLang={language.code}
                lang={language.code}
                className="flex rounded-lg p-2 text-sm hover:bg-muted"
              >
                {language.name}
              </a>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
