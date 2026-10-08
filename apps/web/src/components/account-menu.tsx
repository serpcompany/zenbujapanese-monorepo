'use client'

import {
  LogInIcon,
  LogOutIcon,
  type LucideIcon,
  UserRoundIcon,
  UserRoundPlusIcon
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { ThemeMenuRow } from '@/components/mode-toggle'
import { LogInButton } from '@/components/site-actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useSignedInInitials } from '@/hooks/use-seems-signed-in'
import { builtAccountService } from '@/lib/account/availability'
import { accountApi } from '@/lib/account/client'
import { signOutOfThisBrowser } from '@/lib/account/flows'
import { failureMessage } from '@/lib/account/messages'
import { accountPages } from '@/lib/account/pages'
import { rememberSignedIn } from '@/lib/account/signed-in'
import { type LinkTo, linkTo } from '@/lib/site'
import { cn } from '@/lib/utils'

function useSignedInHere(): string | null {
  const initials = useSignedInInitials()
  return builtAccountService() ? initials : null
}

async function signOut(pathname: string) {
  const service = builtAccountService()
  if (!service) return
  const problem = await signOutOfThisBrowser(accountApi(service))
  if (problem) return void toast.error(failureMessage(problem))
  rememberSignedIn(false)
  if (pathname === accountPages.account.path) window.location.reload()
}

function MenuLink({ to, icon: Icon, title }: { to: LinkTo; icon: LucideIcon; title: string }) {
  return (
    <DropdownMenuItem render={<Link href={to.href} data-link-target={to.target} />}>
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

export function AccountMenu({ className }: { className?: string }) {
  const initials = useSignedInHere()
  const pathname = usePathname()
  const signedIn = initials !== null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon-lg" className={cn('rounded-full', className)} />
        }
      >
        <AccountMark initials={initials} />
        <span className="sr-only">{signedIn ? 'Account, signed in' : 'Account'}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {signedIn ? (
          <MenuLink
            to={{ href: accountPages.account.path }}
            icon={UserRoundIcon}
            title="Your account"
          />
        ) : (
          <>
            <MenuLink to={linkTo('login')} icon={LogInIcon} title="Log in" />
            <MenuLink to={linkTo('register')} icon={UserRoundPlusIcon} title="Create an account" />
          </>
        )}
        <DropdownMenuSeparator />
        <ThemeMenuRow />
        {signedIn ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void signOut(pathname)}>
              <LogOutIcon aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DrawerAccountButton({ onClick }: { onClick: () => void }) {
  const initials = useSignedInHere()
  if (initials === null) {
    return <LogInButton variant="outline" size="lg" className="w-full" onClick={onClick} />
  }
  return (
    <Button
      variant="outline"
      size="lg"
      className="w-full"
      nativeButton={false}
      render={<Link href={accountPages.account.path} onClick={onClick} />}
    >
      <AccountMark initials={initials} />
      Your account
    </Button>
  )
}
