'use client'

import Link from 'next/link'
import { useSeemsSignedIn } from '@/hooks/use-seems-signed-in'
import { accountPages } from '@/lib/account/pages'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/paths'
import { type LinkTo, linkTo } from '@/lib/site'

export function AccountFooterLink({
  locale,
  text,
  className
}: {
  locale: Locale
  text: { account: string; signIn: string }
  className?: string
}) {
  const signedIn = useSeemsSignedIn()
  const link: LinkTo = signedIn ? { href: accountPages.account.path } : linkTo('login')
  return (
    <Link
      href={localizedPath(link.href, locale)}
      data-link-target={link.target}
      className={className}
    >
      {signedIn ? text.account : text.signIn}
    </Link>
  )
}
