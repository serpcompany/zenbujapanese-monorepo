import { createHash } from 'node:crypto'
import { AwsClient } from 'aws4fetch'
import type { R2Config } from '../config'
import type { PhotoStorage } from '../domain/photo-files'

const requestSeconds = 30
const retries = 2
const noSuchKey = '<Code>NoSuchKey</Code>'

async function refused(response: Response, doing: string): Promise<never> {
  await response.body?.cancel()
  throw new Error(`R2 answered ${response.status} to ${doing}`)
}

const decoded = (text: string) =>
  text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')

export function r2Storage(config: R2Config): PhotoStorage {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
    retries
  })
  const bucketUrl = `${config.endpoint}/${encodeURIComponent(config.bucket)}`
  const objectUrl = (key: string) =>
    `${bucketUrl}/${key.split('/').map(encodeURIComponent).join('/')}`
  const send = (url: string, init: RequestInit = {}) =>
    client.fetch(url, { ...init, signal: AbortSignal.timeout(requestSeconds * 1000) })

  async function remove(key: string) {
    const response = await send(objectUrl(key), { method: 'DELETE' })
    if (!response.ok && response.status !== 404) return refused(response, 'a deletion')
    await response.body?.cancel()
  }

  async function listed(prefix: string, after: string | null) {
    const query = new URLSearchParams({ 'list-type': '2', prefix })
    if (after) query.set('continuation-token', after)
    const response = await send(`${bucketUrl}?${query}`)
    if (!response.ok) return refused(response, 'a listing')
    const text = await response.text()
    const keys = [...text.matchAll(/<Key>([^<]*)<\/Key>/g)].map(match => decoded(match[1] ?? ''))
    const next = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(text)?.[1]
    return { keys, next: next ? decoded(next) : null }
  }

  return {
    async put(key, bytes, contentType) {
      const response = await send(objectUrl(key), {
        method: 'PUT',
        body: bytes,
        headers: {
          'content-type': contentType,
          'x-amz-content-sha256': createHash('sha256').update(bytes).digest('hex')
        }
      })
      if (!response.ok) return refused(response, 'an upload')
      await response.body?.cancel()
    },
    async get(key) {
      const response = await send(objectUrl(key))
      if (response.status === 404) {
        const text = await response.text()
        if (text.includes(noSuchKey)) return null
        throw new Error('R2 answered 404 to a download, and not for a missing key')
      }
      if (!response.ok || !response.body) return refused(response, 'a download')
      const size = Number(response.headers.get('content-length'))
      return { body: response.body, size: Number.isFinite(size) && size > 0 ? size : null }
    },
    async has(key) {
      const response = await send(objectUrl(key), { method: 'HEAD' })
      await response.body?.cancel()
      if (response.status === 404) return false
      if (!response.ok) return refused(response, 'a check')
      return true
    },
    delete: remove,
    async deleteUnder(prefix) {
      let after: string | null = null
      do {
        const page: { keys: string[]; next: string | null } = await listed(prefix, after)
        for (const key of page.keys) await remove(key)
        after = page.next
      } while (after)
    }
  }
}
