import { useEffect, useState } from 'react'
import { askCopy } from '../shared/account-copy'
import { accountLabels } from './labels'

type Unsynced = { owner: string; count: number }

export function UnsyncedWarning() {
  const [unsynced, setUnsynced] = useState<Unsynced | null>(null)
  useEffect(() => {
    let live = true
    void askCopy({ copy: 'read' }).then(answer => {
      if (!live || answer.type !== 'copy') return
      const { owner, unsynced: count } = answer.copy
      setUnsynced(owner !== null && count > 0 ? { owner, count } : null)
    })
    return () => {
      live = false
    }
  }, [])
  if (unsynced === null) return null
  return (
    <output data-account-unsynced className="block text-sm">
      {accountLabels.unsynced(unsynced.count, unsynced.owner)}
    </output>
  )
}
