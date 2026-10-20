'use client'

import { ChevronDownIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

export type MenuSide = 'bottom' | 'top'

export function MenuLink(props: ComponentProps<'a'>) {
  return <a {...props} />
}

export function MenuButton({
  label,
  trigger,
  side = 'bottom',
  className,
  children
}: {
  label: string
  trigger: ReactNode
  side?: MenuSide
  className?: string
  children: ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="lg" className={className} aria-label={label} />}
      >
        {trigger}
        <ChevronDownIcon data-icon="inline-end" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={side} className="w-40">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
