'use client'

import { useCallback, useRef } from 'react'
import {
  type AppleAuthorization,
  type ApplePreparation,
  appleReturnUrl,
  prepareApple,
  signInWithApplePopup
} from '@/lib/account/apple'
import type { AccountApi } from '@/lib/account/client'
import { failureMessage } from '@/lib/account/messages'

export type AppleOutcome =
  | { ok: true; authorization: AppleAuthorization; nonce: string; returnUrl: string }
  | { ok: false; message: string | null }

const popupMessages = {
  cancelled: null,
  blocked: "Your browser blocked Apple's window. Allow pop-ups for this site, then try again.",
  failed: "Signing in with Apple didn't work. Try again."
} as const

const nonceGoodForMs = 9 * 60_000

export function useAppleSignIn(api: AccountApi, servicesId: string | null) {
  const preparing = useRef<{ since: number; preparation: Promise<ApplePreparation> } | null>(null)

  const prepare = useCallback(() => {
    const held = preparing.current
    if (held && Date.now() - held.since < nonceGoodForMs) return held.preparation
    const preparation = prepareApple(api.nonce)
    preparing.current = { since: Date.now(), preparation }
    return preparation
  }, [api])

  const signIn = useCallback(async (): Promise<AppleOutcome> => {
    if (!servicesId) return { ok: false, message: popupMessages.failed }
    const preparation = await prepare()
    preparing.current = null
    if (!preparation.ok) {
      return {
        ok: false,
        message: preparation.failure
          ? failureMessage(preparation.failure)
          : "We couldn't load Sign in with Apple. Check your connection, or use another way."
      }
    }
    const { auth, nonce, nonceHash } = preparation.prepared
    const returnUrl = appleReturnUrl(window.location.origin)
    const popup = await signInWithApplePopup(auth, {
      clientId: servicesId,
      nonceHash,
      redirectURI: returnUrl
    })
    void prepare()
    if (!popup.ok) return { ok: false, message: popupMessages[popup.reason] }
    return { ok: true, authorization: popup.authorization, nonce, returnUrl }
  }, [prepare, servicesId])

  return { prepare, signIn }
}
