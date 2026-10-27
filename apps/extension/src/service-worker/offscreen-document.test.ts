import { describe, expect, it, vi } from 'vitest'
import {
  type OffscreenChrome,
  type OffscreenDocumentKeeper,
  offscreenDocumentKeeper
} from './offscreen-document'

function fakeChrome({ starts = true } = {}) {
  let open = false
  let keeper: OffscreenDocumentKeeper | undefined
  const api = {
    getURL: (path: string) => `chrome-extension://zenbu/${path}`,
    getContexts: vi.fn(async () => (open ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] : [])),
    createDocument: vi.fn(async () => {
      await Promise.resolve()
      open = true
      if (starts) setTimeout(() => keeper?.documentStarted())
    })
  } satisfies OffscreenChrome
  const keep = (startTimeoutMs?: number) => {
    keeper = offscreenDocumentKeeper(api, startTimeoutMs)
    return keeper
  }
  return { api, keep, close: () => (open = false) }
}

describe('offscreenDocumentKeeper', () => {
  it('creates the document for a worker when none is open', async () => {
    const { api, keep } = fakeChrome()
    await keep().ensureOpen()
    expect(api.getContexts).toHaveBeenCalledWith({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: ['chrome-extension://zenbu/offscreen/offscreen.html']
    })
    expect(api.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'offscreen/offscreen.html', reasons: ['WORKERS'] })
    )
  })

  it('creates it once when several messages arrive together', async () => {
    const { api, keep } = fakeChrome()
    const { ensureOpen } = keep()
    await Promise.all([ensureOpen(), ensureOpen(), ensureOpen()])
    await ensureOpen()
    expect(api.createDocument).toHaveBeenCalledTimes(1)
  })

  it('waits until the new document says it has started, not only until Chrome creates it', async () => {
    const { keep } = fakeChrome({ starts: false })
    const keeper = keep()
    let opened = false
    const opening = keeper.ensureOpen().then(() => (opened = true))
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(opened).toBe(false)
    keeper.documentStarted()
    await opening
    expect(opened).toBe(true)
  })

  it('fails when the new document never says it has started', async () => {
    const { keep } = fakeChrome({ starts: false })
    await expect(keep(10).ensureOpen()).rejects.toThrow('The offscreen document did not start.')
  })

  it('accepts the document another message opened after it last looked', async () => {
    const { api, keep } = fakeChrome()
    api.getContexts
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }])
    api.createDocument.mockRejectedValueOnce(
      new Error('Only a single offscreen document may be created.')
    )
    await expect(keep().ensureOpen()).resolves.toBeUndefined()
  })

  it('passes on a failure to open it', async () => {
    const { api, keep } = fakeChrome()
    api.createDocument.mockRejectedValueOnce(new Error('Offscreen documents are unavailable.'))
    await expect(keep().ensureOpen()).rejects.toThrow('Offscreen documents are unavailable.')
  })

  it('creates it again after Chrome closes it', async () => {
    const { api, keep, close } = fakeChrome()
    const { ensureOpen } = keep()
    await ensureOpen()
    close()
    await ensureOpen()
    expect(api.createDocument).toHaveBeenCalledTimes(2)
  })
})
