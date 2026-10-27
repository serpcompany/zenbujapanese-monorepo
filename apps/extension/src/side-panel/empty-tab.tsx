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
import type { ComponentType } from 'react'
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

export function emptyTab(
  Icon: LucideIcon,
  text: EmptyText,
  Action?: ComponentType
): ComponentType<PanelTabProps> {
  return function EmptyTab() {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
          <EmptyTitle>{text.title}</EmptyTitle>
          {text.description && <EmptyDescription>{text.description}</EmptyDescription>}
        </EmptyHeader>
        {Action && (
          <EmptyContent>
            <Action />
          </EmptyContent>
        )}
      </Empty>
    )
  }
}
