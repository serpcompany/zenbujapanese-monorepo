'use client'

import Link from 'next/link'
import { useSeemsSignedIn } from '@/hooks/use-seems-signed-in'
import { accountPages } from '@/lib/account/pages'
import { type LinkTo, linkTo } from '@/lib/site'

export function AccountFooterLink({ className }: { className?: string }) {
  const signedIn = useSeemsSignedIn()
  const link: LinkTo = signedIn ? { href: accountPages.account.path } : linkTo('login')
  return (
    <Link href={link.href} data-link-target={link.target} className={className}>
      {signedIn ? 'Account' : 'Sign in'}
    </Link>
  )
}
