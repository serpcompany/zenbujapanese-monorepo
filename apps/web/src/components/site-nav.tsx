'use client'

import { ArrowRightIcon, SearchIcon } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ReactNode, useId } from 'react'
import { menuItemClassName, SiteMenuItem } from '@/components/site-menu-item'
import { buttonVariants } from '@/components/ui/button'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger
} from '@/components/ui/navigation-menu'
import {
  isCurrentPage,
  isCurrentSection,
  type LinkMenu,
  type MegaMenu,
  type MenuLink,
  siteMenus
} from '@/lib/site-menus'
import { cn } from '@/lib/utils'

function NavLink({
  path,
  className,
  children
}: {
  path: string
  className?: string
  children: ReactNode
}) {
  return (
    <NavigationMenuLink
      closeOnClick
      active={isCurrentPage(path, usePathname())}
      className={className}
      render={<Link href={path} />}
    >
      {children}
    </NavigationMenuLink>
  )
}

function MenuColumn({ heading, links }: { heading: string; links: MenuLink[] }) {
  const headingId = useId()
  return (
    <div className="min-w-0">
      <p
        id={headingId}
        className="px-2 pt-1 pb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
      >
        {heading}
      </p>
      <ul aria-labelledby={headingId} className="flex flex-col gap-0.5">
        {links.map(link => (
          <li key={link.path}>
            <NavLink path={link.path} className={menuItemClassName}>
              <SiteMenuItem link={link} />
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MegaMenuPanel({ menu }: { menu: MegaMenu }) {
  const { entry, feature, footer } = menu
  return (
    <div className="grid w-[min(56rem,calc(100vw-2.5rem))] grid-cols-[15rem_repeat(3,minmax(0,1fr))] gap-4 p-3">
      <NavLink
        path={entry.path}
        className="flex-col items-stretch gap-2.5 overflow-hidden bg-muted p-4 hover:bg-muted focus:bg-muted data-active:bg-muted"
      >
        <span className="-mx-4 -mt-4 mb-1 flex h-30 justify-center overflow-hidden bg-foreground/5 pt-4">
          <Image
            src={feature.screenshot}
            alt=""
            width={112}
            height={124}
            unoptimized
            className="h-auto w-28 self-start rounded-t-[15px] ring-1 ring-foreground/10"
          />
        </span>
        <span className="text-[15px] font-semibold">{feature.title}</span>
        <span className="text-[13px] leading-snug text-muted-foreground">
          {feature.description}
        </span>
        <span className={cn(buttonVariants({ size: 'lg' }), 'mt-1 self-start')}>
          <SearchIcon data-icon="inline-start" aria-hidden="true" />
          {feature.action}
        </span>
      </NavLink>
      {menu.columns.map(column => (
        <MenuColumn key={column.heading} heading={column.heading} links={column.links} />
      ))}
      <div className="col-span-full flex flex-wrap items-center justify-between gap-2 border-t px-2 pt-3 text-[13px]">
        <span className="text-muted-foreground">{footer.note}</span>
        <NavLink path={footer.path} className="gap-1 px-2 py-1 text-[13px] font-medium">
          {footer.title}
          <ArrowRightIcon aria-hidden="true" />
        </NavLink>
      </div>
    </div>
  )
}

function LinkMenuPanel({ menu }: { menu: LinkMenu }) {
  return (
    <ul aria-label={menu.label} className="flex w-48 flex-col gap-0.5 p-1">
      {menu.links.map(link => (
        <li key={link.path}>
          <NavLink path={link.path} className="px-3">
            {link.title}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

export function SiteNav() {
  const pathname = usePathname()
  return (
    <NavigationMenu aria-label="Main" className="max-lg:hidden">
      <NavigationMenuList className="gap-1">
        {siteMenus.map(menu => (
          <NavigationMenuItem key={menu.label}>
            <NavigationMenuTrigger
              aria-current={isCurrentSection(menu, pathname) ? 'true' : undefined}
              className="text-muted-foreground hover:text-foreground aria-[current]:bg-muted aria-[current]:text-foreground data-popup-open:text-foreground"
            >
              {menu.label}
            </NavigationMenuTrigger>
            <NavigationMenuContent keepMounted>
              {menu.kind === 'mega' ? <MegaMenuPanel menu={menu} /> : <LinkMenuPanel menu={menu} />}
            </NavigationMenuContent>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  )
}
