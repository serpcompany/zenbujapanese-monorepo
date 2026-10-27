import { createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload, SignJWT } from 'jose'

export const now = () => Math.floor(Date.now() / 1000)

export async function accessTokenSigner(issuer: string) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' })
  const keys = { keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'EdDSA' }] }
  const sign = (claims: JWTPayload, expires: number | null = now() + 900, audience = issuer) => {
    const token = new SignJWT(claims)
      .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
    return (expires === null ? token : token.setExpirationTime(expires)).sign(privateKey)
  }
  return { keys, keySet: createLocalJWKSet(keys), sign }
}
