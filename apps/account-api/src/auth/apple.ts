import { importPKCS8, SignJWT } from 'jose'
import type { AppleSigningKey } from '../config'

export const appleSecretDays = 180
const appleAudience = 'https://appleid.apple.com'

export async function appleClientSecret(
  key: AppleSigningKey,
  servicesId: string,
  now: Date = new Date()
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: key.keyId })
    .setIssuer(key.teamId)
    .setSubject(servicesId)
    .setAudience(appleAudience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + appleSecretDays * 24 * 60 * 60)
    .sign(await importPKCS8(key.privateKey, 'ES256'))
}
