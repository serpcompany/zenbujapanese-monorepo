'use client'

import { DropdownMenuItem } from '@zenbu/ui/components/dropdown-menu'
import { CheckIcon } from 'lucide-react'
import { useState } from 'react'
import { Flag } from '@/components/flag'
import { MenuButton, MenuLink, type MenuSide } from '@/components/menu-button'
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
          <MenuLink
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
  side
}: Switcher & { className?: string; side?: MenuSide }) {
  const shown = languages.find(language => language.code === current)
  return (
    <MenuButton
      label={shown ? `${shown.short}, ${label}` : label}
      trigger={
        <>
          {shown ? <Flag region={shown.region} /> : null}
          {shown?.short}
        </>
      }
      side={side}
      className={className}
    >
      <LanguageItems current={current} languages={languages} />
    </MenuButton>
  )
}
