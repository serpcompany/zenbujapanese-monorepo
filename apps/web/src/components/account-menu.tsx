'use client'

import { Button } from '@zenbu/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@zenbu/ui/components/dropdown-menu'
import {
  LogInIcon,
  LogOutIcon,
  type LucideIcon,
  UserRoundIcon,
  UserRoundPlusIcon
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ThemeMenuRow, type ThemeText } from '@/components/mode-toggle'
import { ReadingAidsMenuGroup, type ReadingAidsText } from '@/components/reading-aids-menu'
import { LogInButton } from '@/components/site-actions'
import { useSignedInInitials } from '@/hooks/use-seems-signed-in'
import { builtAccountService } from '@/lib/account/availability'
import { signOutFromTheAccountMenu } from '@/lib/account/flows'
import { type AccountMessages, failureMessage } from '@/lib/account/messages'
import { accountPages } from '@/lib/account/pages'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import { type LinkTo, linkTo } from '@/lib/site'
import { cn } from '@/lib/utils'

function useSignedInHere(): string | null {
  const initials = useSignedInInitials()
  return builtAccountService() ? initials : null
}

async function signOut(messages: AccountMessages, locale: Locale) {
  const problem = await signOutFromTheAccountMenu(locale)
  if (problem) toast.error(failureMessage(problem, messages, locale))
}

type AccountText = Dictionary['chrome']['account']

function MenuLink({
  to,
  locale,
  icon: Icon,
  title
}: {
  to: LinkTo
  locale: Locale
  icon: LucideIcon
  title: string
}) {
  return (
    <DropdownMenuItem
      render={<Link href={localizedPath(to.href, locale)} data-link-target={to.target} />}
    >
      <Icon aria-hidden="true" />
      {title}
    </DropdownMenuItem>
  )
}

function AccountMark({ initials }: { initials: string | null }) {
  return initials ? (
    <span aria-hidden="true" className="text-xs font-semibold">
      {initials}
    </span>
  ) : (
    <UserRoundIcon aria-hidden="true" />
  )
}

export function AccountMenu({
  locale,
  text,
  theme,
  readingAids,
  messages,
  className
}: {
  locale: Locale
  text: AccountText
  theme: ThemeText
  readingAids: ReadingAidsText
  messages: AccountMessages
  className?: string
}) {
  const initials = useSignedInHere()
  const signedIn = initials !== null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon-lg" className={cn('rounded-full', className)} />
        }
      >
        <AccountMark initials={initials} />
        <span className="sr-only">{signedIn ? text.signedIn : text.account}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {signedIn ? (
          <MenuLink
            to={{ href: accountPages.account.path }}
            locale={locale}
            icon={UserRoundIcon}
            title={text.yourAccount}
          />
        ) : (
          <>
            <MenuLink to={linkTo('login')} locale={locale} icon={LogInIcon} title={text.logIn} />
            <MenuLink
              to={linkTo('register')}
              locale={locale}
              icon={UserRoundPlusIcon}
              title={text.register}
            />
          </>
        )}
        <DropdownMenuSeparator />
        <ReadingAidsMenuGroup text={readingAids} />
        <DropdownMenuSeparator />
        <ThemeMenuRow text={theme} />
        {signedIn ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void signOut(messages, locale)}>
              <LogOutIcon aria-hidden="true" />
              {text.signOut}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DrawerAccountButton({
  locale,
  text,
  logIn,
  onClick
}: {
  locale: Locale
  text: AccountText
  logIn: string
  onClick: () => void
}) {
  const initials = useSignedInHere()
  if (initials === null) {
    return (
      <LogInButton
        locale={locale}
        label={logIn}
        variant="outline"
        size="lg"
        className="w-full"
        onClick={onClick}
      />
    )
  }
  return (
    <Button
      variant="outline"
      size="lg"
      className="w-full"
      nativeButton={false}
      render={<Link href={localizedPath(accountPages.account.path, locale)} onClick={onClick} />}
    >
      <AccountMark initials={initials} />
      {text.yourAccount}
    </Button>
  )
}
