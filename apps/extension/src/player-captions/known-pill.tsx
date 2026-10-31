import { GraduationCapIcon } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { type KnownShare, shareFraction, shareTone } from '../video-tab/known-share'
import { videoTabLabels } from '../video-tab/labels'
import { playerCaptionLabels as labels } from './labels'

const pillClass =
  'flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-sm text-white shadow-md transition-opacity duration-200 motion-reduce:transition-none data-hidden:opacity-0'

export function KnownPill({ share: store, shown }: { share: KnownShare; shown: boolean }) {
  const share = useSyncExternalStore(store.subscribe, store.share)
  if (share === 'hidden' || share === 'incomplete') return null
  const fraction = share === 'counting' ? null : shareFraction(share)
  return (
    <p data-known-pill data-hidden={shown ? undefined : ''} className={pillClass}>
      <GraduationCapIcon aria-hidden className="size-4" />
      {fraction === null ? (
        videoTabLabels.countingKnown
      ) : (
        <span>
          {labels.youKnow}{' '}
          <span className={`font-semibold tabular-nums ${shareTone(fraction)}`}>
            {videoTabLabels.knownPercent(fraction)}
          </span>
        </span>
      )}
    </p>
  )
}
