'use client'

import { Fill } from '@/components/fill'
import { Button } from '@/components/ui/button'
import { isKnown, markKnown } from '@/lib/account/learner-items'
import type { SyncedPartProps } from './synced-props'

export function SyncedKnown({ copy, item, synced, text, account }: SyncedPartProps) {
  const known = isKnown(copy, item)
  return (
    <div className="flex flex-col gap-3">
      <p>
        <Fill
          template={known ? text.synced.known.known : text.synced.known.unknown}
          values={{ name: <span lang="ja">{item.headword}</span> }}
        />
      </p>
      <Button
        type="button"
        variant={known ? 'outline' : 'default'}
        className="self-start"
        disabled={synced.busy}
        onClick={() => void synced.run(held => markKnown(held, item, !known))}
      >
        {known ? account.synced.knownWords.markUnknown : text.markKnown}
      </Button>
    </div>
  )
}
