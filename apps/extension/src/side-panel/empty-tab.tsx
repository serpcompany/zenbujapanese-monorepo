import { Button } from '@zenbu/ui/components/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@zenbu/ui/components/empty'
import type { LucideIcon } from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { websiteOrigin } from '../shared/hosts'
import { labels } from './labels'
import type { PanelTabProps } from './route'

type EmptyText = { title: string; description?: string }

const signUpUrl = `${websiteOrigin}/register/`

export function SignUpButton() {
  return (
    <Button
      nativeButton={false}
      render={
        <a href={signUpUrl} target="_blank" rel="noreferrer">
          {labels.signUp}
        </a>
      }
    />
  )
}

export function EmptyState({
  icon: Icon,
  text,
  className,
  children
}: {
  icon: LucideIcon
  text: EmptyText
  className?: string
  children?: ReactNode
}) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{text.title}</EmptyTitle>
        {text.description && <EmptyDescription>{text.description}</EmptyDescription>}
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  )
}

export function emptyTab(Icon: LucideIcon, text: EmptyText): ComponentType<PanelTabProps> {
  return function EmptyTab() {
    return <EmptyState icon={Icon} text={text} className="h-full" />
  }
}
