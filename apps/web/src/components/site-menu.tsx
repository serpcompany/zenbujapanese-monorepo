'use client'

import { MenuIcon, XIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { DrawerAccountButton } from '@/components/account-menu'
import { ModeToggle } from '@/components/mode-toggle'
import { GetAppButton } from '@/components/site-actions'
import { SiteLogo } from '@/components/site-brand'
import { menuItemClassName, SiteMenuItem } from '@/components/site-menu-item'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger
} from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'
import { site } from '@/lib/site'
import {
  drawerLinks,
  isCurrentPage,
  isCurrentSection,
  type SiteMenu as Menu,
  siteMenus
} from '@/lib/site-menus'
import { cn } from '@/lib/utils'

function useMenuOpenOnThisPage() {
  const pathname = usePathname()
  const wide = useMediaQuery('(min-width: 1024px)')
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname && !wide
  if (openOn !== null && !open) setOpenOn(null)
  const setOpen = (next: boolean) => setOpenOn(next ? pathname : null)
  return [open, setOpen] as const
}

const linkClassName = 'flex rounded-lg p-2 text-sm hover:bg-muted'

function GroupLinks({
  menu,
  pathname,
  onNavigate
}: {
  menu: Menu
  pathname: string
  onNavigate: () => void
}) {
  const links =
    menu.kind === 'mega'
      ? drawerLinks(menu).map(link => ({ ...link, body: <SiteMenuItem link={link} /> }))
      : menu.links.map(link => ({ ...link, body: link.title }))
  return (
    <ul className="flex flex-col gap-0.5">
      {links.map(link => (
        <li key={link.title}>
          <Link
            href={link.href}
            data-link-target={'target' in link ? link.target : undefined}
            aria-current={isCurrentPage(link.href, pathname) ? 'page' : undefined}
            onClick={onNavigate}
            className={cn(
              linkClassName,
              menu.kind === 'mega' && menuItemClassName,
              'aria-[current]:bg-muted'
            )}
          >
            {link.body}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function SiteMenu() {
  const [open, setOpen] = useMenuOpenOnThisPage()
  const pathname = usePathname()
  const current = siteMenus.find(menu => isCurrentSection(menu, pathname))
  return (
    <Drawer open={open} onOpenChange={setOpen} swipeDirection="right">
      <DrawerTrigger
        render={<Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Menu" />}
      >
        <MenuIcon aria-hidden="true" />
      </DrawerTrigger>
      <DrawerContent className="w-[min(90%,24rem)]">
        <DrawerHeader className="flex-row items-center justify-between border-b py-2.5">
          <DrawerTitle className="flex items-center gap-2">
            <SiteLogo />
            {site.name}
          </DrawerTitle>
          <div className="-mr-2 flex items-center gap-1">
            <ModeToggle />
            <DrawerClose render={<Button variant="ghost" size="icon-lg" aria-label="Close" />}>
              <XIcon aria-hidden="true" />
            </DrawerClose>
          </div>
        </DrawerHeader>
        <nav aria-label="Sections" className="min-h-0 flex-1 overflow-y-auto px-4">
          <Accordion key={current?.label} defaultValue={current ? [current.label] : []}>
            {siteMenus.map(menu => (
              <AccordionItem key={menu.label} value={menu.label}>
                <AccordionTrigger className="py-3.5 text-base hover:no-underline">
                  {menu.label}
                </AccordionTrigger>
                <AccordionContent className="pb-3 [&_a]:no-underline">
                  <GroupLinks menu={menu} pathname={pathname} onNavigate={() => setOpen(false)} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </nav>
        <DrawerFooter className="border-t">
          <DrawerAccountButton onClick={() => setOpen(false)} />
          <GetAppButton size="lg" className="w-full" onClick={() => setOpen(false)} />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
