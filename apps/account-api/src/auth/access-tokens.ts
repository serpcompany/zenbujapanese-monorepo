import { createLocalJWKSet, errors, type JSONWebKeySet, jwtVerify } from 'jose'

const reloadAfterMs = 30_000

export type AccessTokenVerifier = (token: string) => Promise<string | null>

export function accessTokenVerifier(
  publishedKeys: () => Promise<JSONWebKeySet>,
  issuer: string
): AccessTokenVerifier {
  let keys: Promise<ReturnType<typeof createLocalJWKSet>> | null = null
  let loadedAt = 0

  const load = () => {
    loadedAt = Date.now()
    keys = publishedKeys()
      .then(createLocalJWKSet)
      .catch(error => {
        keys = null
        throw error
      })
    return keys
  }

  const subjectOf = async (token: string, keySet: ReturnType<typeof createLocalJWKSet>) => {
    const { payload } = await jwtVerify(token, keySet, {
      issuer,
      audience: issuer,
      algorithms: ['EdDSA']
    })
    return typeof payload.sub === 'string' && payload.sub !== '' ? payload.sub : null
  }

  return async token => {
    try {
      return await subjectOf(token, await (keys ?? load()))
    } catch (error) {
      if (!(error instanceof errors.JOSEError)) throw error
      if (!(error instanceof errors.JWKSNoMatchingKey) || Date.now() - loadedAt < reloadAfterMs) {
        return null
      }
    }
    try {
      return await subjectOf(token, await load())
    } catch (error) {
      if (error instanceof errors.JOSEError) return null
      throw error
    }
  }
}
