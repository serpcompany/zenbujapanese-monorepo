import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { r2Storage } from './r2'

interface Seen {
  method: string
  path: string
  headers: IncomingMessage['headers']
  body: Buffer
}

const seen: Seen[] = []
const objects = new Map<string, { body: Buffer; type: string }>()
let failing = false

const server = createServer((request, response) => {
  const chunks: Buffer[] = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    const body = Buffer.concat(chunks)
    const path = request.url ?? ''
    seen.push({ method: request.method ?? '', path, headers: request.headers, body })
    if (failing) {
      response.writeHead(403).end('<Error><Code>AccessDenied</Code></Error>')
      return
    }
    if (request.method === 'PUT') {
      objects.set(path, { body, type: String(request.headers['content-type']) })
      response.writeHead(200).end()
    } else if (request.method === 'GET') {
      const found = objects.get(path)
      if (found) response.writeHead(200, { 'content-type': found.type }).end(found.body)
      else response.writeHead(404).end('<Error><Code>NoSuchKey</Code></Error>')
    } else {
      objects.delete(path)
      response.writeHead(204).end()
    }
  })
})

let storage: ReturnType<typeof r2Storage>

beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  storage = r2Storage({
    endpoint: `http://127.0.0.1:${port}`,
    bucket: 'zenbujapanese-account-photos-test',
    accessKeyId: 'test-key-id',
    secretAccessKey: 'test-secret'
  })
})

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

describe('photos in R2', () => {
  test('puts, gets, and deletes an object by its key in the bucket, signed for S3', async () => {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
    await storage.put('account-1/5f0c', bytes, 'image/jpeg')
    const put = seen.at(-1)
    expect(put).toMatchObject({
      method: 'PUT',
      path: '/zenbujapanese-account-photos-test/account-1/5f0c'
    })
    expect(put?.headers['content-type']).toBe('image/jpeg')
    expect(put?.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=test-key-id\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=[^,]*host[^,]*, Signature=[0-9a-f]{64}$/
    )
    expect(put?.headers['x-amz-content-sha256']).toBe(
      createHash('sha256').update(bytes).digest('hex')
    )
    expect(put?.headers.authorization).toContain('x-amz-content-sha256')
    expect(new Uint8Array(put?.body ?? [])).toEqual(bytes)
    expect(await storage.get('account-1/5f0c')).toEqual(bytes)
    await storage.delete('account-1/5f0c')
    expect(seen.at(-1)).toMatchObject({ method: 'DELETE' })
    expect(await storage.get('account-1/5f0c')).toBeNull()
    await storage.delete('account-1/5f0c')
  })

  test('throws when R2 refuses, saying only the status', async () => {
    failing = true
    try {
      await expect(storage.put('account-1/x', new Uint8Array([1]), 'image/png')).rejects.toThrow(
        'R2 answered 403 to an upload'
      )
      await expect(storage.get('account-1/x')).rejects.toThrow('R2 answered 403 to a download')
      await expect(storage.delete('account-1/x')).rejects.toThrow('R2 answered 403 to a deletion')
    } finally {
      failing = false
    }
  })
})
