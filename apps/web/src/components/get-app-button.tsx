import { SmartphoneIcon } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { appStoreLink } from '@/lib/site'

export function GetAppButton({ className, size }: { className?: string; size?: 'default' | 'lg' }) {
  return (
    <Button
      size={size}
      className={className}
      nativeButton={false}
      render={<Link href={appStoreLink.href} data-outside-link={appStoreLink.id} />}
    >
      <SmartphoneIcon data-icon="inline-start" aria-hidden="true" />
      Get the app
    </Button>
  )
}
