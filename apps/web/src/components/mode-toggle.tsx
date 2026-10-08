'use client'

import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

const themeChoices = [
  { theme: 'light', label: 'Light', icon: SunIcon },
  { theme: 'dark', label: 'Dark', icon: MoonIcon },
  { theme: 'system', label: 'System', icon: MonitorIcon }
] as const

export function ModeToggle({
  className,
  variant = 'ghost'
}: Pick<ComponentProps<typeof Button>, 'className' | 'variant'>) {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant={variant} size="icon-lg" className={className} />}
      >
        <SunIcon
          aria-hidden="true"
          className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
        />
        <MoonIcon
          aria-hidden="true"
          className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
        />
        <span className="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {themeChoices.map(({ theme: value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} closeOnClick>
              <Icon aria-hidden="true" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
