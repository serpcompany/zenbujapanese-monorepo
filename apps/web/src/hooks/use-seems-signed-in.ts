'use client'

import { useSyncExternalStore } from 'react'
import { onSignedInChange, seemsSignedIn, signedInInitials } from '@/lib/account/signed-in'

export function useSeemsSignedIn(): boolean {
  return useSyncExternalStore(onSignedInChange, seemsSignedIn, () => false)
}

export function useSignedInInitials(): string | null {
  return useSyncExternalStore(onSignedInChange, signedInInitials, () => null)
}
