import { createRemoteJWKSet, customFetch, errors, type FetchImplementation, jwtVerify } from 'jose'
import { AccountKeysUnavailable, type AccountTokens } from './service'

const refusedTokens = [
  errors.JWTExpired,
  errors.JWTClaimValidationFailed,
  errors.JWTInvalid,
  errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
  errors.JWKSNoMatchingKey,
  errors.JWKSMultipleMatchingKeys
]

export function accountTokens(options: {
  accountUrl: string
  jwksUrl: string
  fetch?: FetchImplementation
}): AccountTokens {
  const keys = createRemoteJWKSet(new URL(options.jwksUrl), {
    cooldownDuration: 30_000,
    ...(options.fetch ? { [customFetch]: options.fetch } : {})
  })
  return async token => {
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer: options.accountUrl,
        audience: options.accountUrl,
        algorithms: ['EdDSA']
      })
      const { sub, azp, scope } = payload
      if (typeof sub !== 'string' || sub === '' || typeof azp !== 'string') return null
      const scopes = typeof scope === 'string' ? scope.split(' ').filter(Boolean) : []
      return { account: sub, app: azp, scopes: new Set(scopes) }
    } catch (error) {
      if (refusedTokens.some(refused => error instanceof refused)) return null
      throw new AccountKeysUnavailable("The account service's keys couldn't be read", {
        cause: error
      })
    }
  }
}
