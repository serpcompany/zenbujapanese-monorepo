'use client'

import { MenuIcon, XIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useSectionLinks } from '@/components/site-nav'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger
} from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'
import { site } from '@/lib/site'
import { cn } from '@/lib/utils'

function useMenuOpenOnThisPage() {
  const pathname = usePathname()
  const wide = useMediaQuery('(min-width: 768px)')
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname && !wide
  if (openOn !== null && !open) setOpenOn(null)
  const setOpen = (next: boolean) => setOpenOn(next ? pathname : null)
  return [open, setOpen] as const
}

export function SiteMenu() {
  const [open, setOpen] = useMenuOpenOnThisPage()
  const sections = useSectionLinks()
  return (
    <Drawer open={open} onOpenChange={setOpen} swipeDirection="right">
      <DrawerTrigger
        render={<Button variant="ghost" size="icon-lg" className="md:hidden" aria-label="Menu" />}
      >
        <MenuIcon aria-hidden="true" />
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="flex-row items-center justify-between py-2.5">
          <DrawerTitle>{site.name}</DrawerTitle>
          <DrawerClose
            render={<Button variant="ghost" size="icon-lg" className="-mr-2" aria-label="Close" />}
          >
            <XIcon aria-hidden="true" />
          </DrawerClose>
        </DrawerHeader>
        <nav aria-label="Sections" className="flex flex-col gap-1 px-2 py-3">
          {sections.map(section => (
            <Link
              key={section.path}
              href={section.path}
              aria-current={section.ariaCurrent}
              onClick={() => setOpen(false)}
              className={cn(
                'rounded-md px-2 py-2.5 text-base font-medium hover:bg-muted',
                section.currentClass
              )}
            >
              {section.label}
            </Link>
          ))}
        </nav>
      </DrawerContent>
    </Drawer>
  )
}
