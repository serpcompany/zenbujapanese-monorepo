'use client'

import { useSyncExternalStore } from 'react'
import { onSignedInChange, seemsSignedIn } from '@/lib/account/signed-in'

export function useSeemsSignedIn(): boolean {
  return useSyncExternalStore(onSignedInChange, seemsSignedIn, () => false)
}
