import { describe, expect, test, vi } from 'vitest'
import { imageTypeOf } from '../domain/photo-files'
import { useAccountService } from '../test/accounts'
import { standIns } from '../test/app'
import { gate } from '../test/gate'
import { logged } from '../test/logged'
import { aJpeg, photoIdOf, uploaded } from '../test/photos'
import { websiteOrigin } from '../test/service'
import { createApp } from './app'
import { atOnce } from './rate-limit'

const accounts = useAccountService()

const service = () => accounts.running.service
const rows = (sql: string) => service().rows(sql)
const put = (token: string, photoId: string, bytes: Uint8Array) =>
  service().sendPhoto(token, photoId, bytes)
const get = (token: string, photoId: string) =>
  service().sendPhoto(token, photoId, new Uint8Array(), 'GET')

const bytesOf = (hex: string, size = 16) => {
  const bytes = new Uint8Array(size)
  bytes.set(Buffer.from(hex, 'hex'))
  return bytes
}

describe('photo files', () => {
  test('an upload keeps the bytes under their SHA-256, and uploading them again changes nothing', async () => {
    const learner = await accounts.learner('photo-upload@example.com')
    const bytes = aJpeg(2048)
    const photoId = photoIdOf(bytes)
    const first = await put(learner.token, photoId, bytes)
    expect(first.status).toBe(201)
    const file = await first.json()
    expect(file).toEqual({
      id: photoId,
      contentType: 'image/jpeg',
      byteSize: 2048,
      uploadedAt: expect.any(String)
    })
    const again = await put(learner.token, photoId, bytes)
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual(file)
    const [stored] = await rows(
      `select storage_key from photo_files where user_id = '${learner.userId}'`
    )
    expect(String(stored?.storage_key)).toMatch(new RegExp(`^${learner.userId}/[0-9a-f-]{36}$`))
    expect(service().photoStorage.objects.size).toBeGreaterThan(0)
    expect(await rows('select count(*)::int as n from photo_file_deletions')).toEqual([{ n: 0 }])
  })

  test('a download answers the bytes with their type, for good, to the account that holds them only', async () => {
    const learner = await accounts.learner('photo-download@example.com')
    const other = await accounts.learner('photo-download-other@example.com')
    const bytes = aJpeg(300)
    const photoId = await uploaded(accounts, learner, bytes)
    const answer = await get(learner.token, photoId)
    expect(answer.status).toBe(200)
    expect(answer.headers.get('content-type')).toBe('image/jpeg')
    expect(answer.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
    expect(answer.headers.get('etag')).toBe(`"${photoId}"`)
    expect(answer.headers.get('x-content-type-options')).toBe('nosniff')
    expect(answer.headers.get('content-disposition')).toBe(`attachment; filename="${photoId}"`)
    expect(answer.headers.get('content-length')).toBe('300')
    expect(new Uint8Array(await answer.arrayBuffer())).toEqual(bytes)
    for (const [token, id] of [
      [other.token, photoId],
      [learner.token, photoIdOf(aJpeg())]
    ] as const) {
      const missing = await get(token, id)
      expect(missing.status).toBe(404)
      expect(await missing.json()).toMatchObject({ error: { code: 'not_found' } })
    }
  })

  test('refuses bytes that are not the ID, are no image, or are too big, and a bad ID', async () => {
    const learner = await accounts.learner('photo-refused@example.com')
    const bytes = aJpeg()
    const wrong = await put(learner.token, photoIdOf(aJpeg()), bytes)
    expect(wrong.status).toBe(400)
    expect(await wrong.json()).toMatchObject({ error: { code: 'photo_digest_mismatch' } })
    const text = new TextEncoder().encode('not a photo at all')
    const notImage = await put(learner.token, photoIdOf(text), text)
    expect(notImage.status).toBe(415)
    expect(await notImage.json()).toMatchObject({ error: { code: 'unsupported_photo' } })
    const huge = aJpeg(12 * 1024 * 1024 + 1)
    const tooBig = await put(learner.token, photoIdOf(huge), huge)
    expect(tooBig.status).toBe(413)
    expect(await tooBig.json()).toMatchObject({ error: { code: 'too_large' } })
    const badId = await put(learner.token, 'ABC', bytes)
    expect(badId.status).toBe(400)
    expect(await badId.json()).toMatchObject({ error: { code: 'bad_request' } })
    expect(await rows(`select id from photo_files where user_id = '${learner.userId}'`)).toEqual([])
  })

  test('reads each image type from its bytes', () => {
    expect(
      [
        bytesOf('ffd8ffe0'),
        bytesOf('89504e470d0a1a0a'),
        bytesOf(Buffer.from('GIF89a').toString('hex')),
        bytesOf(
          `${Buffer.from('RIFF').toString('hex')}00000000${Buffer.from('WEBP').toString('hex')}`
        ),
        bytesOf('49492a00'),
        bytesOf('4d4d002a'),
        bytesOf(Buffer.from('BM').toString('hex')),
        bytesOf(`00000018${Buffer.from('ftypheic').toString('hex')}`),
        bytesOf(`00000018${Buffer.from('ftypmif1').toString('hex')}`),
        bytesOf(`00000018${Buffer.from('ftypavif').toString('hex')}`),
        bytesOf(`00000018${Buffer.from('ftypisom').toString('hex')}`),
        bytesOf('25504446')
      ].map(imageTypeOf)
    ).toEqual([
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/tiff',
      'image/tiff',
      'image/bmp',
      'image/heic',
      'image/heif',
      'image/avif',
      null,
      null
    ])
  })

  test('holds at most 1,000 files to an account, and still answers one it holds', async () => {
    const learner = await accounts.learner('photo-cap@example.com')
    const kept = await uploaded(accounts, learner)
    await rows(
      `insert into photo_files (user_id, id, content_type, byte_size, storage_key) select '${learner.userId}', md5(n::text) || md5(n::text), 'image/jpeg', 1, '${learner.userId}/' || n from generate_series(1, 999) as n`
    )
    const bytes = aJpeg()
    const full = await put(learner.token, photoIdOf(bytes), bytes)
    expect(full.status).toBe(409)
    expect(await full.json()).toMatchObject({ error: { code: 'too_many_photos' } })
    expect((await get(learner.token, kept)).status).toBe(200)
    expect(
      await rows('select count(*)::int as n from photo_file_deletions where due_at <= now()')
    ).toEqual([{ n: 0 }])
  })

  test('answers 503 where the service keeps no photos', async () => {
    const bytes = aJpeg()
    for (const method of ['PUT', 'GET']) {
      const answer = await standInRequest(standInApp(), method, bytes)
      expect(answer.status, method).toBe(503)
      expect(await answer.json()).toMatchObject({ error: { code: 'photos_unavailable' } })
    }
  })

  test.each(
    turnTaking
  )('takes %s from one account up to its share while the service has room, and asks the next to wait a second', async (_, method, most) => {
    const turns = heldTurns(method)
    const waiting = Array.from({ length: most.account }, () => turns.send('first'))
    await vi.waitFor(() => expect(turns.started()).toBe(most.account))
    let answer: Response | null = null
    const extra = turns.send('first').then(answered => {
      answer = answered
      return answered
    })
    await vi.waitFor(() => expect(answer !== null || turns.started() > most.account).toBe(true))
    turns.open()
    const turnedAway = await extra
    expect(turnedAway.status).toBe(429)
    expect(turnedAway.headers.get('retry-after')).toBe('1')
    expect(await turnedAway.json()).toMatchObject({ error: { code: 'too_many_requests' } })
    expect((await Promise.all(waiting)).map(answer => answer.status)).toEqual(
      Array(most.account).fill(503)
    )
  })

  test.each(
    turnTaking
  )('takes %s from every account together up to the service share', async (_, method, most) => {
    const turns = heldTurns(method)
    const waiting = Array.from({ length: most.service }, (_, n) =>
      turns.send(`account-${Math.floor(n / most.account)}`)
    )
    await vi.waitFor(() => expect(turns.started()).toBe(most.service))
    expect((await turns.send('one-more-account')).status).toBe(429)
    turns.open()
    expect((await Promise.all(waiting)).map(answer => answer.status)).toEqual(
      Array(most.service).fill(503)
    )
    expect((await turns.send('someone')).status).toBe(503)
  })

  test("holds a download's turn until its file is sent, cancelled, or cut, and logs a cut one", async () => {
    const sources: ReadableStreamDefaultController<Uint8Array>[] = []
    const streaming = async () => ({
      status: 'found' as const,
      file: {
        id: 'a'.repeat(64),
        contentType: 'image/jpeg',
        byteSize: 3,
        storageKey: 'k',
        uploadedAt: new Date()
      },
      photo: {
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            sources.push(controller)
            controller.enqueue(Uint8Array.from([0xff, 0xd8, 0xff]))
          }
        }),
        size: null
      }
    })
    const app = standInApp({ ...standIns.photoFiles, download: streaming })
    const bytes = aJpeg()
    const download = () => standInRequest(app, 'GET', bytes)
    const share = atOnce.downloads.account
    const sending = await Promise.all(Array.from({ length: share }, download))
    expect([...sending.map(answer => answer.status), (await download()).status]).toEqual([
      ...Array(share).fill(200),
      429
    ])
    sources[0]?.close()
    expect(new Uint8Array(await (sending[0] ?? new Response()).arrayBuffer())).toEqual(
      Uint8Array.from([0xff, 0xd8, 0xff])
    )
    await sending[1]?.body?.cancel()
    const lines = logged()
    sources[2]?.error(new Error('R2 closed the connection'))
    await expect(sending[2]?.arrayBuffer()).rejects.toThrow('R2 closed the connection')
    expect(lines()).toContain('a photo download was cut')
    vi.restoreAllMocks()
    const again = await Promise.all(Array.from({ length: 4 }, download))
    expect(again.map(answer => answer.status)).toEqual([200, 200, 200, 429])
  })

  test("puts back a file its storage lost when it's uploaded again, and says a lost file is missing, not gone", async () => {
    const learner = await accounts.learner('photo-lost-file@example.com')
    const bytes = aJpeg()
    const photoId = await uploaded(accounts, learner, bytes)
    service().photoStorage.objects.clear()
    const lost = await get(learner.token, photoId)
    expect(lost.status).toBe(404)
    expect(await lost.json()).toMatchObject({ error: { code: 'photo_file_missing' } })
    expect((await put(learner.token, photoId, bytes)).status).toBe(200)
    expect(new Uint8Array(await (await get(learner.token, photoId)).arrayBuffer())).toEqual(bytes)
  })

  test('lets the website send and read photo files from its own origin', async () => {
    const preflight = await service().app.request('http://localhost:8789/v1/photos/x', {
      method: 'OPTIONS',
      headers: {
        origin: websiteOrigin,
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'authorization, content-type'
      }
    })
    expect(preflight.headers.get('access-control-allow-origin')).toBe(websiteOrigin)
    expect(preflight.headers.get('access-control-allow-methods')).toContain('PUT')
  })
})

function standInApp(photoFiles = standIns.photoFiles) {
  return createApp({
    ...standIns,
    photoFiles,
    verifyAccessToken: async token => ({
      userId: token,
      clientId: 'zenbu-ios',
      scopes: new Set(['photos:read', 'photos:write'] as const),
      signedInAt: new Date()
    })
  })
}

const standInRequest = (
  app: ReturnType<typeof createApp>,
  method: string,
  bytes: Uint8Array,
  account = 'someone'
) =>
  app.request(`/v1/photos/${photoIdOf(bytes)}`, {
    method,
    headers: { authorization: `Bearer ${account}` },
    body: method === 'PUT' ? bytes : undefined
  })

const turnTaking = [
  ['uploads', 'PUT', atOnce.uploads],
  ['downloads', 'GET', atOnce.downloads]
] as const

function heldTurns(method: string) {
  const turn = gate()
  let started = 0
  const waitThenRefuse = async () => {
    started++
    await turn.opened
    return { status: 'unavailable' } as const
  }
  const app = standInApp({ upload: waitThenRefuse, download: waitThenRefuse })
  const bytes = aJpeg()
  return {
    send: async (account: string) => standInRequest(app, method, bytes, account),
    started: () => started,
    open: turn.open
  }
}
