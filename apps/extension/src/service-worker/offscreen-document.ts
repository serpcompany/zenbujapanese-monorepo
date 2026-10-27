const offscreenDocumentPath = 'offscreen/offscreen.html'

export type OffscreenChrome = {
  getURL(path: string): string
  getContexts(filter: {
    contextTypes: chrome.runtime.ContextType[]
    documentUrls: string[]
  }): Promise<unknown[]>
  createDocument(parameters: chrome.offscreen.CreateParameters): Promise<void>
}

export function offscreenDocumentKeeper(api: OffscreenChrome): () => Promise<void> {
  let creating: Promise<void> | undefined

  async function isOpen(): Promise<boolean> {
    const contexts = await api.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
      documentUrls: [api.getURL(offscreenDocumentPath)]
    })
    return contexts.length > 0
  }

  return async function ensureOpen() {
    if (creating) return creating
    if (await isOpen()) return
    creating ??= api
      .createDocument({
        url: offscreenDocumentPath,
        reasons: ['WORKERS' as chrome.offscreen.Reason],
        justification: 'Hosts the dedicated worker that holds the dictionary.'
      })
      .catch(async (error: unknown) => {
        if (!(await isOpen())) throw error
      })
      .finally(() => {
        creating = undefined
      })
    return creating
  }
}
