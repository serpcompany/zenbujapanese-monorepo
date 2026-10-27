'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@zenbu/ui/components/accordion'
import { Button } from '@zenbu/ui/components/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger
} from '@zenbu/ui/components/drawer'
import { useMediaQuery } from '@zenbu/ui/hooks/use-media-query'
import { MenuIcon, XIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { DrawerAccountButton } from '@/components/account-menu'
import { ModeToggle } from '@/components/mode-toggle'
import { ReadingAidsToggle } from '@/components/reading-aids-menu'
import { GetAppButton } from '@/components/site-actions'
import { SiteLogo } from '@/components/site-brand'
import { menuItemClassName, SiteMenuItem } from '@/components/site-menu-item'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { site } from '@/lib/site'
import { drawerLinks, isCurrentPage, isCurrentSection } from '@/lib/site-menu-links'
import type { SiteMenu as Menu } from '@/lib/site-menus'
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

export function SiteMenu({
  locale,
  menus,
  text
}: {
  locale: Locale
  menus: readonly Menu[]
  text: Dictionary['chrome']
}) {
  const [open, setOpen] = useMenuOpenOnThisPage()
  const pathname = usePathname()
  const current = menus.find(menu => isCurrentSection(menu, pathname))
  return (
    <Drawer open={open} onOpenChange={setOpen} swipeDirection="right">
      <DrawerTrigger
        render={
          <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label={text.menu} />
        }
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
            <ReadingAidsToggle text={text.readingAids} />
            <ModeToggle text={text.theme} />
            <DrawerClose render={<Button variant="ghost" size="icon-lg" aria-label={text.close} />}>
              <XIcon aria-hidden="true" />
            </DrawerClose>
          </div>
        </DrawerHeader>
        <nav aria-label={text.sections} className="min-h-0 flex-1 overflow-y-auto px-4">
          <Accordion key={current?.label} defaultValue={current ? [current.label] : []}>
            {menus.map(menu => (
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
          <DrawerAccountButton
            locale={locale}
            text={text.account}
            logIn={text.logIn}
            onClick={() => setOpen(false)}
          />
          <GetAppButton
            locale={locale}
            label={text.getTheApp}
            size="lg"
            className="w-full"
            onClick={() => setOpen(false)}
          />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
