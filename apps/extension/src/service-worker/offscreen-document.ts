const offscreenDocumentPath = 'offscreen/offscreen.html'

const offscreenStartTimeoutMs = 10_000

export type OffscreenChrome = {
  getURL(path: string): string
  getContexts(filter: {
    contextTypes: chrome.runtime.ContextType[]
    documentUrls: string[]
  }): Promise<unknown[]>
  createDocument(parameters: chrome.offscreen.CreateParameters): Promise<void>
}

export type OffscreenDocumentKeeper = {
  ensureOpen(): Promise<void>
  documentStarted(): void
}

export function offscreenDocumentKeeper(
  api: OffscreenChrome,
  startTimeoutMs = offscreenStartTimeoutMs
): OffscreenDocumentKeeper {
  let creating: Promise<void> | undefined
  let markStarted: (() => void) | undefined

  async function isOpen(): Promise<boolean> {
    const contexts = await api.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
      documentUrls: [api.getURL(offscreenDocumentPath)]
    })
    return contexts.length > 0
  }

  function create(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('The offscreen document did not start.')),
        startTimeoutMs
      )
      const started = () => {
        clearTimeout(timer)
        resolve()
      }
      markStarted = started
      api
        .createDocument({
          url: offscreenDocumentPath,
          reasons: ['WORKERS' as chrome.offscreen.Reason],
          justification: 'Hosts the dedicated worker that holds the dictionary.'
        })
        .catch(async (error: unknown) => {
          if (await isOpen()) return started()
          clearTimeout(timer)
          reject(error)
        })
    }).finally(() => {
      creating = undefined
      markStarted = undefined
    })
  }

  return {
    async ensureOpen() {
      if (creating) return creating
      if (await isOpen()) return
      creating ??= create()
      return creating
    },
    documentStarted() {
      markStarted?.()
    }
  }
}
