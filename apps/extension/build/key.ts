import { createHash } from 'node:crypto'

export const storeKey =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5uAlduoosGiDp546eJM3EzFbT/PPJZigG0gcr9BaM7jfY88eYgaFFkC7aLbgpwxzvVD85/S9DcDCr1C/1Ja4MTArCNFlbtPyW3SX7Icz+v6QcSi520HTjDkRAbDQUNw8cTc+YCRlldQi3BpLSKpiHf6jLKBlaPlZHM/QSQlnjXy4cOlgsd0zkdzPLiyLxo/mSz1p97ucVLDln/0LMVTczFGxb4mK79hMhYr+zVXlzBiP/DX0kX2EXqty9pUuG3HebQxYYizHuJ+Mzq+IkA7h3I/sHedvxe8D3OAAwubY2guSAvTUycULKw/rkvJLqAudCUZUUjiChW1HL7FkdLQG3wIDAQAB'

export const storeExtensionId = 'kaalpflpefadijdemimciikalgpgjmok'

const idLength = 32
const firstIdLetter = 'a'.charCodeAt(0)

export function extensionIdOf(key: string): string {
  const digest = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex')
  return [...digest.slice(0, idLength)]
    .map(digit => String.fromCharCode(firstIdLetter + Number.parseInt(digit, 16)))
    .join('')
}
