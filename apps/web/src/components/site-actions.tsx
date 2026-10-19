import { SmartphoneIcon } from 'lucide-react'
import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/paths'
import { type LinkTargetId, linkTo } from '@/lib/site'

type ActionProps = Pick<ComponentProps<typeof Button>, 'className' | 'size' | 'variant'> & {
  locale: Locale
  label: string
  onClick?: () => void
}

function LinkTargetButton({
  target,
  locale,
  onClick,
  children,
  ...props
}: Omit<ActionProps, 'label'> & { target: LinkTargetId; children: ReactNode }) {
  const link = linkTo(target)
  return (
    <Button
      {...props}
      nativeButton={false}
      render={
        <Link
          href={localizedPath(link.href, locale)}
          data-link-target={link.target}
          onClick={onClick}
        />
      }
    >
      {children}
    </Button>
  )
}

function GetTheApp({ target, label, ...props }: ActionProps & { target: LinkTargetId }) {
  return (
    <LinkTargetButton target={target} {...props}>
      <SmartphoneIcon data-icon="inline-start" aria-hidden="true" />
      {label}
    </LinkTargetButton>
  )
}

export function GetAppButton(props: ActionProps) {
  return <GetTheApp target="iphone-app" {...props} />
}

export function AppStoreButton(props: ActionProps) {
  return <GetTheApp target="app-store" {...props} />
}

export function LogInButton({ label, ...props }: ActionProps) {
  return (
    <LinkTargetButton target="login" {...props}>
      {label}
    </LinkTargetButton>
  )
}
