import { SmartphoneIcon } from 'lucide-react'
import Link from 'next/link'
import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { appStoreLink, loginLink } from '@/lib/site'

type ActionProps = Pick<ComponentProps<typeof Button>, 'className' | 'size' | 'variant'>

export function GetAppButton(props: ActionProps) {
  return (
    <Button
      {...props}
      nativeButton={false}
      render={<Link href={appStoreLink.href} data-link-target={appStoreLink.id} />}
    >
      <SmartphoneIcon data-icon="inline-start" aria-hidden="true" />
      Get the app
    </Button>
  )
}

export function LogInButton(props: ActionProps) {
  return (
    <Button
      {...props}
      nativeButton={false}
      render={<Link href={loginLink.href} data-link-target={loginLink.id} />}
    >
      Log in
    </Button>
  )
}
