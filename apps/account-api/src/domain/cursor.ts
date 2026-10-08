import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

const format = 1
const nonceBytes = 12
const sequenceBytes = 8
const tagBytes = 16
const cursorBytes = 1 + nonceBytes + sequenceBytes + tagBytes
const cipher = 'aes-256-gcm'

export interface Cursors {
  encode(userId: string, sequence: number): string
  decode(userId: string, cursor: string): number | null
}

export function cursorKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('zenbu sync cursor').digest()
}

const boundTo = (userId: string) => Buffer.concat([Buffer.of(format), Buffer.from(userId)])

export function cursors(key: Buffer): Cursors {
  return {
    encode(userId, sequence) {
      const nonce = randomBytes(nonceBytes)
      const sealing = createCipheriv(cipher, key, nonce, { authTagLength: tagBytes })
      sealing.setAAD(boundTo(userId))
      const position = Buffer.alloc(sequenceBytes)
      position.writeBigUInt64BE(BigInt(sequence))
      const sealed = Buffer.concat([sealing.update(position), sealing.final()])
      return Buffer.concat([Buffer.of(format), nonce, sealed, sealing.getAuthTag()]).toString(
        'base64url'
      )
    },
    decode(userId, cursor) {
      if (!/^[A-Za-z0-9_-]+$/.test(cursor)) return null
      const bytes = Buffer.from(cursor, 'base64url')
      if (bytes.length !== cursorBytes || bytes.readUInt8(0) !== format) return null
      const nonce = bytes.subarray(1, 1 + nonceBytes)
      const sealed = bytes.subarray(1 + nonceBytes, 1 + nonceBytes + sequenceBytes)
      const opening = createDecipheriv(cipher, key, nonce, { authTagLength: tagBytes })
      opening.setAAD(boundTo(userId))
      opening.setAuthTag(bytes.subarray(cursorBytes - tagBytes))
      try {
        const sequence = Buffer.concat([opening.update(sealed), opening.final()]).readBigUInt64BE()
        return sequence > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(sequence)
      } catch {
        return null
      }
    }
  }
}
