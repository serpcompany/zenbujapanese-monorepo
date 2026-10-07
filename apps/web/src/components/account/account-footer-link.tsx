'use client'

import Link from 'next/link'
import { useSeemsSignedIn } from '@/hooks/use-seems-signed-in'
import { accountPages } from '@/lib/account/pages'

export function AccountFooterLink({ className }: { className?: string }) {
  const signedIn = useSeemsSignedIn()
  return (
    <Link
      href={signedIn ? accountPages.account.path : accountPages.signIn.path}
      className={className}
    >
      {signedIn ? 'Account' : 'Sign in'}
    </Link>
  )
}
