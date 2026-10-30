import type { HTMLAttributes, ReactNode } from 'react'
import type { CaptionPlace } from '../shared/settings'
import { type KeepPlace, useCaptionDrag } from './caption-drag'
import { placeStyle } from './caption-place'

export const captionRoomClass =
  "absolute inset-x-4 inset-y-0 flex flex-col items-center justify-end gap-[0.32em] text-[clamp(16px,2.4cqw,34px)] after:h-[calc(max(64px,12%)-0.32em)] after:shrink-0 after:content-['']"

const boxClass =
  "pointer-events-auto relative w-max max-w-[min(92%,48em)] cursor-grab touch-none select-none rounded-lg bg-black/75 text-center text-white transition-shadow duration-280 before:pointer-events-none before:absolute before:top-[0.12em] before:left-1/2 before:h-[3px] before:w-[1.1em] before:-translate-x-1/2 before:rounded-full before:bg-white/70 before:opacity-0 before:transition-opacity before:content-[''] hover:before:opacity-80 data-pressed:ring-2 data-pressed:ring-white/85 data-dragging:cursor-grabbing data-dragging:ring-2 data-dragging:ring-white/85 data-dragging:shadow-[0_10px_28px_rgb(0_0_0/0.45)] data-dragging:before:opacity-80 data-dragging:**:cursor-grabbing"

type Props = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
  place: CaptionPlace | null
  keep: KeepPlace
  children: ReactNode
}

export function CaptionBox({ place, keep, className, children, ...attributes }: Props) {
  const drag = useCaptionDrag(keep)
  return (
    <div
      {...attributes}
      data-pressed={drag.stage === 'pressed' ? '' : undefined}
      data-dragging={drag.stage === 'lifted' ? '' : undefined}
      style={placeStyle(drag.moving ?? place)}
      className={`${boxClass} ${className ?? ''}`}
      {...drag.handlers}
    >
      {children}
    </div>
  )
}
