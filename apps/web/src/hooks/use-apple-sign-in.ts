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
import { type AccountMessages, failureMessage } from '@/lib/account/messages'
import type { Locale } from '@/lib/i18n/config'

export type AppleOutcome =
  | { ok: true; authorization: AppleAuthorization; nonce: string; returnUrl: string }
  | { ok: false; message: string | null }

const nonceGoodForMs = 9 * 60_000

export function useAppleSignIn(
  api: AccountApi,
  servicesId: string | null,
  messages: AccountMessages,
  locale: Locale
) {
  const preparing = useRef<{ since: number; preparation: Promise<ApplePreparation> } | null>(null)

  const prepare = useCallback(() => {
    const held = preparing.current
    if (held && Date.now() - held.since < nonceGoodForMs) return held.preparation
    const preparation = prepareApple(api.nonce)
    preparing.current = { since: Date.now(), preparation }
    void preparation.then(prepared => {
      if (!prepared.ok && preparing.current?.preparation === preparation) preparing.current = null
    })
    return preparation
  }, [api])

  const signIn = useCallback(async (): Promise<AppleOutcome> => {
    const popupMessages = { cancelled: null, ...messages.apple }
    if (!servicesId) return { ok: false, message: popupMessages.failed }
    const preparation = await prepare()
    preparing.current = null
    if (!preparation.ok) {
      return {
        ok: false,
        message: preparation.failure
          ? failureMessage(preparation.failure, messages, locale)
          : popupMessages.unloaded
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
  }, [prepare, servicesId, messages, locale])

  return { prepare, signIn }
}
