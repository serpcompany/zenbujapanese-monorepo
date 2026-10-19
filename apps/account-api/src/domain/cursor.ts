import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

const positionOnly = 1
const withForgotten = 2
const nonceBytes = 12
const numberBytes = 8
const tagBytes = 16
const cipher = 'aes-256-gcm'

export interface Position {
  sequence: number
  forgotten: number
}

export interface Cursors {
  encode(userId: string, position: Position): string
  decode(userId: string, cursor: string): Position | null
}

export function cursorKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('zenbu sync cursor').digest()
}

export function searchKeys(secret: string): (userId: string) => string {
  const key = createHmac('sha256', secret).update('zenbu recent searches').digest()
  return userId => createHmac('sha256', key).update(userId).digest('hex')
}

const boundTo = (format: number, userId: string) =>
  Buffer.concat([Buffer.of(format), Buffer.from(userId)])

const numbersIn = { [positionOnly]: 1, [withForgotten]: 2 } as const

const lengthOf = (format: keyof typeof numbersIn) =>
  1 + nonceBytes + numbersIn[format] * numberBytes + tagBytes

function readNumber(bytes: Buffer, at: number): number | null {
  const value = bytes.readBigUInt64BE(at)
  return value > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(value)
}

export function cursors(key: Buffer): Cursors {
  return {
    encode(userId, { sequence, forgotten }) {
      const nonce = randomBytes(nonceBytes)
      const sealing = createCipheriv(cipher, key, nonce, { authTagLength: tagBytes })
      sealing.setAAD(boundTo(withForgotten, userId))
      const numbers = Buffer.alloc(2 * numberBytes)
      numbers.writeBigUInt64BE(BigInt(sequence))
      numbers.writeBigUInt64BE(BigInt(forgotten), numberBytes)
      const sealed = Buffer.concat([sealing.update(numbers), sealing.final()])
      return Buffer.concat([
        Buffer.of(withForgotten),
        nonce,
        sealed,
        sealing.getAuthTag()
      ]).toString('base64url')
    },
    decode(userId, cursor) {
      if (!/^[A-Za-z0-9_-]+$/.test(cursor)) return null
      const bytes = Buffer.from(cursor, 'base64url')
      const format = bytes[0]
      if (format !== positionOnly && format !== withForgotten) return null
      if (bytes.length !== lengthOf(format)) return null
      const nonce = bytes.subarray(1, 1 + nonceBytes)
      const sealed = bytes.subarray(1 + nonceBytes, bytes.length - tagBytes)
      const opening = createDecipheriv(cipher, key, nonce, { authTagLength: tagBytes })
      opening.setAAD(boundTo(format, userId))
      opening.setAuthTag(bytes.subarray(bytes.length - tagBytes))
      try {
        const numbers = Buffer.concat([opening.update(sealed), opening.final()])
        const sequence = readNumber(numbers, 0)
        const forgotten = format === withForgotten ? readNumber(numbers, numberBytes) : 0
        return sequence === null || forgotten === null ? null : { sequence, forgotten }
      } catch {
        return null
      }
    }
  }
}
