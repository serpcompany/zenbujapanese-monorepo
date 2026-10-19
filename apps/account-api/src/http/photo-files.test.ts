import { describe, expect, test, vi } from 'vitest'
import { imageTypeOf } from '../domain/photo-files'
import { useAccountService } from '../test/accounts'
import { standIns } from '../test/app'
import { aJpeg, photoIdOf, uploaded } from '../test/photos'
import { createApp } from './app'
import { uploadsAtOnce } from './rate-limit'

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

  test(`takes ${uploadsAtOnce} uploads at once, and asks the next to wait a second`, async () => {
    let release = () => {}
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    let started = 0
    const app = standInApp({
      ...standIns.photoFiles,
      upload: async () => {
        started++
        await held
        return { status: 'unavailable' }
      }
    })
    const bytes = aJpeg()
    const waiting = Array.from({ length: uploadsAtOnce }, () => standInRequest(app, 'PUT', bytes))
    await vi.waitFor(() => expect(started).toBe(uploadsAtOnce))
    const turnedAway = await standInRequest(app, 'PUT', bytes)
    expect(turnedAway.status).toBe(429)
    expect(turnedAway.headers.get('retry-after')).toBe('1')
    expect(await turnedAway.json()).toMatchObject({ error: { code: 'too_many_requests' } })
    release()
    expect((await Promise.all(waiting)).map(answer => answer.status)).toEqual(
      Array(uploadsAtOnce).fill(503)
    )
    expect((await standInRequest(app, 'PUT', bytes)).status).toBe(503)
  })
})

function standInApp(photoFiles = standIns.photoFiles) {
  return createApp({
    ...standIns,
    photoFiles,
    verifyAccessToken: async () => ({
      userId: 'someone',
      clientId: 'zenbu-ios',
      scopes: new Set(['photos:read', 'photos:write'] as const),
      signedInAt: new Date()
    })
  })
}

const standInRequest = (app: ReturnType<typeof createApp>, method: string, bytes: Uint8Array) =>
  app.request(`/v1/photos/${photoIdOf(bytes)}`, {
    method,
    headers: { authorization: 'Bearer token' },
    body: method === 'PUT' ? bytes : undefined
  })
