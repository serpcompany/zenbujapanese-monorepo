import { type ClientRequest, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { expect, test, vi } from 'vitest'
import { standIns } from '../test/app'
import { gate } from '../test/gate'
import { createApp } from './app'
import { atOnce } from './rate-limit'

const photoId = 'a'.repeat(64)

function heldDownloads() {
  const answering = gate()
  const counts = { started: 0, cancelled: 0 }
  const app = createApp({
    ...standIns,
    photoFiles: {
      ...standIns.photoFiles,
      download: async () => {
        counts.started++
        await answering.opened
        return {
          status: 'found',
          file: {
            id: photoId,
            contentType: 'image/jpeg',
            byteSize: 3,
            storageKey: 'k',
            uploadedAt: new Date(),
            profileUploadAt: null
          },
          photo: {
            body: new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(Uint8Array.from([0xff, 0xd8, 0xff]))
              },
              cancel() {
                counts.cancelled++
              }
            }),
            size: null
          }
        }
      }
    },
    verifyAccessToken: async token => ({
      userId: token,
      clientId: 'zenbu-ios',
      scopes: new Set(['photos:read'] as const),
      signedInAt: new Date()
    })
  })
  return { app, counts, answer: answering.open }
}

const connectionsTo = (server: Server) =>
  new Promise<number>(resolve => server.getConnections((_, count) => resolve(count)))

test('a download the client gives up on before its answer starts gives its slot back, through the real Node adapter', async () => {
  const { app, counts, answer } = heldDownloads()
  const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }) as Server
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo
  const ask = () =>
    request({
      host: '127.0.0.1',
      port,
      path: `/v1/photos/${photoId}`,
      headers: { authorization: 'Bearer one-account' }
    })
  const statusOf = (asked: ClientRequest) =>
    new Promise<number>(resolve => {
      asked.on('error', () => {})
      asked.on('response', response => {
        resolve(response.statusCode ?? 0)
        asked.destroy()
      })
      asked.end()
    })
  const share = atOnce.downloads.account
  const abandoned = Array.from({ length: share }, () => {
    const asked = ask()
    asked.on('error', () => {})
    asked.end()
    return asked
  })
  await vi.waitFor(() => expect(counts.started).toBe(share))
  for (const asked of abandoned) asked.destroy()
  await vi.waitFor(async () => expect(await connectionsTo(server)).toBe(0))
  answer()
  await vi.waitFor(() => expect(counts.cancelled).toBe(share))
  expect(await statusOf(ask())).toBe(200)
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
})
