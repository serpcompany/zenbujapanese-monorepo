import { getCloudflareContext } from '@opennextjs/cloudflare'
import { log } from '@/lib/log'
import { isAnOrigin } from './availability'

export interface AccountSettings {
  apiUrl: string
  appleServicesId: string | null
  google: boolean
}

interface AccountEnv {
  ACCOUNT_API_URL?: string
  ACCOUNT_APPLE_SERVICES_ID?: string
  ACCOUNT_GOOGLE_SIGN_IN?: string
}

export function accountSettingsFrom(env: AccountEnv): AccountSettings | null {
  const apiUrl = env.ACCOUNT_API_URL?.trim() ?? ''
  if (apiUrl === '') return null
  if (!isAnOrigin(apiUrl)) {
    log('error', 'account_service_url_invalid', {
      expected: 'an origin, such as https://example.com'
    })
    return null
  }
  return {
    apiUrl,
    appleServicesId: env.ACCOUNT_APPLE_SERVICES_ID?.trim() || null,
    google: env.ACCOUNT_GOOGLE_SIGN_IN?.trim() === 'on'
  }
}

export async function accountSettings(): Promise<AccountSettings | null> {
  const { env } = await getCloudflareContext({ async: true })
  return accountSettingsFrom(env)
}
