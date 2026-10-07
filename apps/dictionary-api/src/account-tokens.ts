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
    cacheMaxAge: Number.POSITIVE_INFINITY,
    ...(options.fetch ? { [customFetch]: options.fetch } : {})
  })
  return async token => {
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer: options.accountUrl,
        audience: options.accountUrl,
        algorithms: ['EdDSA'],
        requiredClaims: ['exp', 'sub', 'azp', 'scope']
      })
      const { sub, scope } = payload
      if (typeof sub !== 'string' || sub === '' || typeof scope !== 'string') return null
      return { account: sub, scopes: new Set(scope.split(' ').filter(Boolean)) }
    } catch (error) {
      if (refusedTokens.some(refused => error instanceof refused)) return null
      throw new AccountKeysUnavailable("The account service's keys couldn't be read", {
        cause: error
      })
    }
  }
}
