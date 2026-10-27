import { describe, expect, it, vi } from 'vitest'
import { type OffscreenChrome, offscreenDocumentKeeper } from './offscreen-document'

function fakeChrome() {
  let open = false
  const api = {
    getURL: (path: string) => `chrome-extension://zenbu/${path}`,
    getContexts: vi.fn(async () => (open ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] : [])),
    createDocument: vi.fn(async () => {
      await Promise.resolve()
      open = true
    })
  } satisfies OffscreenChrome
  return { api, close: () => (open = false) }
}

describe('offscreenDocumentKeeper', () => {
  it('creates the document for a worker when none is open', async () => {
    const { api } = fakeChrome()
    await offscreenDocumentKeeper(api)()
    expect(api.getContexts).toHaveBeenCalledWith({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: ['chrome-extension://zenbu/offscreen/offscreen.html']
    })
    expect(api.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'offscreen/offscreen.html', reasons: ['WORKERS'] })
    )
  })

  it('creates it once when several messages arrive together', async () => {
    const { api } = fakeChrome()
    const ensureOpen = offscreenDocumentKeeper(api)
    await Promise.all([ensureOpen(), ensureOpen(), ensureOpen()])
    await ensureOpen()
    expect(api.createDocument).toHaveBeenCalledTimes(1)
  })

  it('accepts the document another message opened after it last looked', async () => {
    const { api } = fakeChrome()
    api.getContexts
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }])
    api.createDocument.mockRejectedValueOnce(
      new Error('Only a single offscreen document may be created.')
    )
    await expect(offscreenDocumentKeeper(api)()).resolves.toBeUndefined()
  })

  it('passes on a failure to open it', async () => {
    const { api } = fakeChrome()
    api.createDocument.mockRejectedValueOnce(new Error('Offscreen documents are unavailable.'))
    await expect(offscreenDocumentKeeper(api)()).rejects.toThrow(
      'Offscreen documents are unavailable.'
    )
  })

  it('creates it again after Chrome closes it', async () => {
    const { api, close } = fakeChrome()
    const ensureOpen = offscreenDocumentKeeper(api)
    await ensureOpen()
    close()
    await ensureOpen()
    expect(api.createDocument).toHaveBeenCalledTimes(2)
  })
})
