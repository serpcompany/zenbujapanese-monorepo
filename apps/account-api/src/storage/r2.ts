import { createHash } from 'node:crypto'
import { AwsClient } from 'aws4fetch'
import type { R2Config } from '../config'
import type { PhotoStorage } from '../domain/photo-files'

const requestSeconds = 30
const retries = 2

async function answered(response: Response, doing: string, allowed: readonly number[] = []) {
  if (response.ok || allowed.includes(response.status)) return response
  await response.body?.cancel()
  throw new Error(`R2 answered ${response.status} to ${doing}`)
}

export function r2Storage(config: R2Config): PhotoStorage {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
    retries
  })
  const objectUrl = (key: string) =>
    `${config.endpoint}/${encodeURIComponent(config.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`
  const send = (key: string, init: RequestInit = {}) =>
    client.fetch(objectUrl(key), { ...init, signal: AbortSignal.timeout(requestSeconds * 1000) })

  return {
    async put(key, bytes, contentType) {
      const response = await send(key, {
        method: 'PUT',
        body: bytes,
        headers: {
          'content-type': contentType,
          'x-amz-content-sha256': createHash('sha256').update(bytes).digest('hex')
        }
      })
      await answered(response, 'an upload')
      await response.body?.cancel()
    },
    async get(key) {
      const response = await answered(await send(key), 'a download', [404])
      if (response.status === 404) {
        await response.body?.cancel()
        return null
      }
      return new Uint8Array(await response.arrayBuffer())
    },
    async delete(key) {
      const response = await answered(await send(key, { method: 'DELETE' }), 'a deletion', [404])
      await response.body?.cancel()
    }
  }
}
