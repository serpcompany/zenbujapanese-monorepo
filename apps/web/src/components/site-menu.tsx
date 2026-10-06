'use client'

import { MenuIcon, XIcon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { useSectionLinks } from '@/components/site-nav'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle
} from '@/components/ui/drawer'
import { site } from '@/lib/site'
import { cn } from '@/lib/utils'

export function SiteMenu() {
  const [open, setOpen] = useState(false)
  const sections = useSectionLinks()
  return (
    <>
      <Button
        variant="ghost"
        size="icon-lg"
        className="md:hidden"
        aria-label="Menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MenuIcon aria-hidden="true" />
      </Button>
      <Drawer open={open} onOpenChange={setOpen} swipeDirection="right">
        <DrawerContent>
          <DrawerHeader className="flex-row items-center justify-between py-2.5">
            <DrawerTitle>{site.name}</DrawerTitle>
            <DrawerClose
              render={
                <Button variant="ghost" size="icon-lg" className="-mr-2" aria-label="Close" />
              }
            >
              <XIcon aria-hidden="true" />
            </DrawerClose>
          </DrawerHeader>
          <nav aria-label="Menu" className="flex flex-col gap-1 px-2 py-3">
            {sections.map(section => (
              <Link
                key={section.path}
                href={section.path}
                aria-current={section.ariaCurrent}
                onClick={() => setOpen(false)}
                className={cn(
                  'rounded-md px-2 py-2.5 text-base font-medium hover:bg-muted',
                  section.isCurrent ? 'bg-muted text-foreground' : 'text-muted-foreground'
                )}
              >
                {section.label}
              </Link>
            ))}
          </nav>
        </DrawerContent>
      </Drawer>
    </>
  )
}
