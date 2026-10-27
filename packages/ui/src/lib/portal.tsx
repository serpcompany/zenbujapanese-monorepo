'use client'

import { createContext, useContext } from 'react'

const PortalContainerContext = createContext<HTMLElement | ShadowRoot | null>(null)

export const PortalContainer = PortalContainerContext.Provider

export function usePortalContainer(): HTMLElement | ShadowRoot | undefined {
  return useContext(PortalContainerContext) ?? undefined
}
