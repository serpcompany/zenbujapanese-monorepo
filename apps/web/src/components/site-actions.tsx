import { SmartphoneIcon } from 'lucide-react'
import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { type LinkTargetId, linkTo } from '@/lib/site'

type ActionProps = Pick<ComponentProps<typeof Button>, 'className' | 'size' | 'variant'> & {
  onClick?: () => void
}

function LinkTargetButton({
  target,
  onClick,
  children,
  ...props
}: ActionProps & { target: LinkTargetId; children: ReactNode }) {
  const link = linkTo(target)
  return (
    <Button
      {...props}
      nativeButton={false}
      render={<Link href={link.href} data-link-target={link.target} onClick={onClick} />}
    >
      {children}
    </Button>
  )
}

function GetTheApp({ target, ...props }: ActionProps & { target: LinkTargetId }) {
  return (
    <LinkTargetButton target={target} {...props}>
      <SmartphoneIcon data-icon="inline-start" aria-hidden="true" />
      Get the app
    </LinkTargetButton>
  )
}

export function GetAppButton(props: ActionProps) {
  return <GetTheApp target="iphone-app" {...props} />
}

export function AppStoreButton(props: ActionProps) {
  return <GetTheApp target="app-store" {...props} />
}

export function LogInButton(props: ActionProps) {
  return (
    <LinkTargetButton target="login" {...props}>
      Log in
    </LinkTargetButton>
  )
}
