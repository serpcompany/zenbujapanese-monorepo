import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function Section({
  title,
  id,
  children
}: {
  title: string
  id?: string
  children: ReactNode
}) {
  return (
    <Card id={id} className={id ? 'scroll-mt-4' : undefined}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
