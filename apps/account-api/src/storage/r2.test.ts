import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { gate } from '../test/gate'
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
let noBucket = false
let halfway: ReturnType<typeof gate> | null = null
let unanswered: ReturnType<typeof gate> | null = null
const bucket = '/zenbujapanese-account-photos-test'

function listing(url: URL) {
  const prefix = `${bucket}/${url.searchParams.get('prefix') ?? ''}`
  const keys = [...objects.keys()].filter(key => key.startsWith(prefix)).sort()
  const after = url.searchParams.get('continuation-token')
  const page = keys.filter(key => !after || key > after).slice(0, 1)
  const more = keys.length > 0 && page[0] !== keys.at(-1)
  return `<ListBucketResult>${page.map(key => `<Contents><Key>${key.slice(bucket.length + 1).replaceAll('&', '&amp;')}</Key></Contents>`).join('')}${more ? `<NextContinuationToken>${page[0]}</NextContinuationToken>` : ''}</ListBucketResult>`
}

function sendInTwo(
  response: ServerResponse,
  found: { body: Buffer; type: string },
  pause: Promise<void>
) {
  const half = Math.ceil(found.body.length / 2)
  response.writeHead(200, { 'content-type': found.type, 'content-length': found.body.length })
  response.write(found.body.subarray(0, half))
  void pause.then(() => response.end(found.body.subarray(half)))
}

const server = createServer((request, response) => {
  const chunks: Buffer[] = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', async () => {
    await unanswered?.opened
    const body = Buffer.concat(chunks)
    const path = request.url ?? ''
    seen.push({ method: request.method ?? '', path, headers: request.headers, body })
    if (failing) {
      response.writeHead(403).end('<Error><Code>AccessDenied</Code></Error>')
      return
    }
    if (noBucket) {
      response.writeHead(404).end('<Error><Code>NoSuchBucket</Code></Error>')
      return
    }
    const url = new URL(path, 'http://r2.test')
    if (url.searchParams.get('list-type') === '2') {
      response.writeHead(200, { 'content-type': 'application/xml' }).end(listing(url))
    } else if (request.method === 'PUT') {
      objects.set(decodeURIComponent(url.pathname), {
        body,
        type: String(request.headers['content-type'])
      })
      response.writeHead(200).end()
    } else if (request.method === 'GET' || request.method === 'HEAD') {
      const found = objects.get(decodeURIComponent(url.pathname))
      if (found && halfway) sendInTwo(response, found, halfway.opened)
      else if (found) {
        response
          .writeHead(200, { 'content-type': found.type, 'content-length': found.body.length })
          .end(found.body)
      } else response.writeHead(404).end('<Error><Code>NoSuchKey</Code></Error>')
    } else {
      objects.delete(decodeURIComponent(url.pathname))
      response.writeHead(204).end()
    }
  })
})

let storage: ReturnType<typeof r2Storage>
let config: Parameters<typeof r2Storage>[0]

beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  config = {
    endpoint: `http://127.0.0.1:${port}`,
    bucket: 'zenbujapanese-account-photos-test',
    accessKeyId: 'test-key-id',
    secretAccessKey: 'test-secret'
  }
  storage = r2Storage(config)
})

function heldDeadlines() {
  const pending = new Set<() => void>()
  const deadline = (_ms: number, expire: () => void) => {
    pending.add(expire)
    return () => pending.delete(expire)
  }
  const pass = () => {
    for (const expire of [...pending]) expire()
  }
  return { storage: r2Storage(config, deadline), pending, pass }
}

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
    const read = await storage.get('account-1/5f0c')
    expect(read?.size).toBe(bytes.byteLength)
    expect(new Uint8Array(await new Response(read?.body).arrayBuffer())).toEqual(bytes)
    expect(await storage.has('account-1/5f0c')).toBe(true)
    await storage.delete('account-1/5f0c')
    expect(seen.at(-1)).toMatchObject({ method: 'DELETE' })
    expect(await storage.get('account-1/5f0c')).toBeNull()
    expect(await storage.has('account-1/5f0c')).toBe(false)
    await storage.delete('account-1/5f0c')
  })

  test("deletes every object under an account's folder, page by page, and no other", async () => {
    for (const key of ['account-2/a', 'account-2/b&c', 'account-2/d', 'account-20/kept']) {
      await storage.put(key, new Uint8Array([1]), 'image/png')
    }
    await storage.deleteUnder('account-2/')
    expect([...objects.keys()].filter(key => key.includes('account-2'))).toEqual([
      `${bucket}/account-20/kept`
    ])
  })

  test('tells a missing object from a missing bucket, which it never takes for a missing photo', async () => {
    noBucket = true
    try {
      await expect(storage.get('account-1/x')).rejects.toThrow('not for a missing key')
    } finally {
      noBucket = false
    }
  })

  test("times a download out only until R2 starts answering, so a long one isn't cut", async () => {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6, 7])
    await storage.put('account-3/long', bytes, 'image/jpeg')
    const clock = heldDeadlines()
    halfway = gate()
    try {
      const photo = await clock.storage.get('account-3/long')
      clock.pass()
      halfway.open()
      expect(new Uint8Array(await new Response(photo?.body).arrayBuffer())).toEqual(bytes)
    } finally {
      halfway = null
    }
  })

  test('gives up on a request R2 never starts answering', async () => {
    const clock = heldDeadlines()
    unanswered = gate()
    try {
      const asked = clock.storage.get('account-3/never')
      expect(clock.pending.size).toBe(1)
      clock.pass()
      await expect(asked).rejects.toThrow("R2 didn't answer within 30 seconds")
    } finally {
      unanswered.open()
      unanswered = null
    }
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
