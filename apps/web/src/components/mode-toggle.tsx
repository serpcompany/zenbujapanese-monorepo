'use client'

import { Button } from '@zenbu/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@zenbu/ui/components/dropdown-menu'
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import type { Dictionary } from '@/lib/i18n/dictionary'

export type ThemeText = Dictionary['chrome']['theme']

const themeChoices = [
  { theme: 'light', icon: SunIcon },
  { theme: 'dark', icon: MoonIcon },
  { theme: 'system', icon: MonitorIcon }
] as const

function ThemeIcon() {
  return (
    <>
      <SunIcon
        aria-hidden="true"
        className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
      />
      <MoonIcon
        aria-hidden="true"
        className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
      />
    </>
  )
}

export function ModeToggle({ text }: { text: ThemeText }) {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" />}>
        <ThemeIcon />
        <span className="sr-only">{text.label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {themeChoices.map(({ theme: value, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} closeOnClick>
              <Icon aria-hidden="true" />
              {text[value]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ThemeMenuRow({ text }: { text: ThemeText }) {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenuGroup className="flex items-center justify-between gap-3 py-0.5 pr-0.5 pl-1.5">
      <DropdownMenuLabel className="relative flex items-center gap-1.5 p-0 text-sm font-normal text-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground">
        <ThemeIcon />
        {text.label}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={theme}
        onValueChange={setTheme}
        className="flex gap-px rounded-full p-0.5 ring-1 ring-border"
      >
        {themeChoices.map(({ theme: value, icon: Icon }) => (
          <DropdownMenuRadioItem
            key={value}
            value={value}
            label={text[value]}
            className="size-7 justify-center rounded-full p-0 text-muted-foreground *:data-[slot=dropdown-menu-radio-item-indicator]:hidden focus:text-foreground data-checked:bg-muted data-checked:text-foreground data-checked:ring-1 data-checked:ring-foreground/10 [&_svg:not([class*='size-'])]:size-3.5"
          >
            <Icon aria-hidden="true" />
            <span className="sr-only">{text[value]}</span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  )
}
