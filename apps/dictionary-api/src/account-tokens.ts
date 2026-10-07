import {
  createLocalJWKSet,
  createRemoteJWKSet,
  customFetch,
  errors,
  type FetchImplementation,
  type JWTVerifyGetKey,
  jwtVerify
} from 'jose'
import { errorFields, log } from './log'
import { AccountKeysUnavailable, type AccountTokens } from './service'

const reloadCooldown = 30_000

const keysFreshFor = 10 * 60_000

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

const refused = (error: unknown) => refusedTokens.some(refusal => error instanceof refusal)

const unavailable = (cause: unknown) =>
  new AccountKeysUnavailable("The account service's keys couldn't be read", { cause })

function accountKeys(url: URL, fetchKeys: FetchImplementation): JWTVerifyGetKey {
  let failedAt = Number.NEGATIVE_INFINITY
  const remote = createRemoteJWKSet(url, {
    cooldownDuration: reloadCooldown,
    cacheMaxAge: keysFreshFor,
    [customFetch]: async (href, init) => {
      if (Date.now() - failedAt < reloadCooldown) {
        throw new Error('The last read of the keys failed less than 30 seconds ago')
      }
      return fetchKeys(href, init)
    }
  })
  let lastKnown: JWTVerifyGetKey | undefined
  return async (header, token) => {
    try {
      const key = await remote(header, token)
      lastKnown = undefined
      return key
    } catch (error) {
      if (refused(error)) throw error
      if (Date.now() - failedAt >= reloadCooldown) {
        failedAt = Date.now()
        log('error', 'account keys unavailable', errorFields(error))
      }
      const known = remote.jwks()
      if (!known) throw unavailable(error)
      lastKnown ??= createLocalJWKSet(known)
      try {
        return await lastKnown(header, token)
      } catch {
        throw unavailable(error)
      }
    }
  }
}

export function accountTokens(options: {
  accountUrl: string
  jwksUrl: string
  fetch?: FetchImplementation
}): AccountTokens {
  const keys = accountKeys(new URL(options.jwksUrl), options.fetch ?? fetch)
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
      if (refused(error)) return null
      throw error instanceof AccountKeysUnavailable ? error : unavailable(error)
    }
  }
}
