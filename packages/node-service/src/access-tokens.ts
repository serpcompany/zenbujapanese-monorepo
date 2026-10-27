import { type JWTPayload, type JWTVerifyGetKey, jwtVerify } from 'jose'

export interface AccessTokenClaims extends JWTPayload {
  sub: string
  azp: string
  scope: string
}

const isUsable = (payload: JWTPayload): payload is AccessTokenClaims =>
  typeof payload.sub === 'string' &&
  payload.sub !== '' &&
  typeof payload.azp === 'string' &&
  typeof payload.scope === 'string'

export async function verifiedAccessToken(
  token: string,
  keys: JWTVerifyGetKey,
  accountUrl: string
): Promise<AccessTokenClaims | null> {
  const { payload } = await jwtVerify(token, keys, {
    issuer: accountUrl,
    audience: accountUrl,
    algorithms: ['EdDSA'],
    requiredClaims: ['exp', 'sub', 'azp', 'scope']
  })
  return isUsable(payload) ? payload : null
}

export const scopesOf = (claims: AccessTokenClaims): ReadonlySet<string> =>
  new Set(claims.scope.split(' ').filter(Boolean))
