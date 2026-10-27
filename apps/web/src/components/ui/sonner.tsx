'use client'

import { Toaster as SharedToaster } from '@zenbu/ui/components/sonner'
import { useTheme } from 'next-themes'
import type { ComponentProps } from 'react'

type ToasterProps = ComponentProps<typeof SharedToaster>

const Toaster = (props: ToasterProps) => {
  const { theme = 'system' } = useTheme()
  return <SharedToaster theme={theme as ToasterProps['theme']} {...props} />
}

export { Toaster }
