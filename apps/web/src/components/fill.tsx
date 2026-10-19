import { Fragment, type ReactNode } from 'react'
import { templateParts } from '@/lib/i18n/format'

export function Fill({
  template,
  values
}: {
  template: string
  values: Readonly<Record<string, ReactNode>>
}) {
  return (
    <>
      {templateParts(template).map((part, index) => (
        <Fragment key={`${index}-${part.text}`}>
          {part.name !== undefined && part.name in values ? values[part.name] : part.text}
        </Fragment>
      ))}
    </>
  )
}
