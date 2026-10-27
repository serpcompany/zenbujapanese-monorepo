import { templateParts } from '@zenbu/dictionary-core/detail/text'
import { Fragment, type ReactNode } from 'react'

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
