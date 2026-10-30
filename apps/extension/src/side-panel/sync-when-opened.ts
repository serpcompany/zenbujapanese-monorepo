import { askCopy } from '../shared/account-copy'

export function syncWhenOpened(page: Document = document): () => void {
  const opened = () => void askCopy({ copy: 'opened' })
  const whenShown = () => {
    if (page.visibilityState === 'visible') opened()
  }
  opened()
  page.addEventListener('visibilitychange', whenShown)
  return () => page.removeEventListener('visibilitychange', whenShown)
}
