import { createHash } from 'node:crypto'
import { AwsClient } from 'aws4fetch'
import type { R2Config } from '../config'
import type { PhotoStorage } from '../domain/photo-files'

const answerSeconds = 30
const retries = 2
const noSuchKey = '<Code>NoSuchKey</Code>'

type Deadline = (ms: number, expire: () => void) => () => void

const timerDeadline: Deadline = (ms, expire) => {
  const timer = setTimeout(expire, ms)
  return () => clearTimeout(timer)
}

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

export function r2Storage(config: R2Config, deadline: Deadline = timerDeadline): PhotoStorage {
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

  async function answered<T>(
    url: string,
    init: RequestInit,
    take: (response: Response) => Promise<T>
  ): Promise<T> {
    const waiting = new AbortController()
    const stop = deadline(answerSeconds * 1000, () =>
      waiting.abort(new Error(`R2 didn't answer within ${answerSeconds} seconds`))
    )
    try {
      return await take(await client.fetch(url, { ...init, signal: waiting.signal }))
    } finally {
      stop()
    }
  }

  const remove = (key: string) =>
    answered(objectUrl(key), { method: 'DELETE' }, async response => {
      if (!response.ok && response.status !== 404) return refused(response, 'a deletion')
      await response.body?.cancel()
    })

  const listed = (prefix: string, after: string | null) => {
    const query = new URLSearchParams({ 'list-type': '2', prefix })
    if (after) query.set('continuation-token', after)
    return answered(`${bucketUrl}?${query}`, {}, async response => {
      if (!response.ok) return refused(response, 'a listing')
      const text = await response.text()
      const keys = [...text.matchAll(/<Key>([^<]*)<\/Key>/g)].map(match => decoded(match[1] ?? ''))
      const next = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(text)?.[1]
      return { keys, next: next ? decoded(next) : null }
    })
  }

  return {
    put: (key, bytes, contentType) =>
      answered(
        objectUrl(key),
        {
          method: 'PUT',
          body: bytes,
          headers: {
            'content-type': contentType,
            'x-amz-content-sha256': createHash('sha256').update(bytes).digest('hex')
          }
        },
        async response => {
          if (!response.ok) return refused(response, 'an upload')
          await response.body?.cancel()
        }
      ),
    get: key =>
      answered(objectUrl(key), {}, async response => {
        if (response.status === 404) {
          const text = await response.text()
          if (text.includes(noSuchKey)) return null
          throw new Error('R2 answered 404 to a download, and not for a missing key')
        }
        if (!response.ok || !response.body) return refused(response, 'a download')
        const size = Number(response.headers.get('content-length'))
        return { body: response.body, size: Number.isFinite(size) && size > 0 ? size : null }
      }),
    has: key =>
      answered(objectUrl(key), { method: 'HEAD' }, async response => {
        await response.body?.cancel()
        if (response.status === 404) return false
        if (!response.ok) return refused(response, 'a check')
        return true
      }),
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
