export type Edges = { left: number; top: number; right: number; bottom: number }

export type Size = { width: number; height: number }

export type Placement = { left: number; top: number; side: 'below' | 'above' }

const gap = 8

const margin = 8

const clamp = (value: number, lowest: number, highest: number) =>
  Math.max(lowest, Math.min(value, Math.max(lowest, highest)))

export function popupPlacement(anchor: Edges, popup: Size, window: Size): Placement {
  const below = anchor.bottom + gap
  const above = anchor.top - gap - popup.height
  const fitsBelow = below + popup.height <= window.height - margin
  const fitsAbove = above >= margin
  const side =
    fitsBelow || (!fitsAbove && window.height - anchor.bottom >= anchor.top) ? 'below' : 'above'
  return {
    side,
    left: clamp(anchor.left, margin, window.width - margin - popup.width),
    top: clamp(side === 'below' ? below : above, margin, window.height - margin - popup.height)
  }
}
