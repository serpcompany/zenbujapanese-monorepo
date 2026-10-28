export function openedOnce<T>(open: () => Promise<T>): () => Promise<T> {
  let opened: Promise<T> | null = null
  return () => {
    opened ??= open().catch((error: unknown) => {
      opened = null
      throw error
    })
    return opened
  }
}
