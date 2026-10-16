'use client'

import {
  type StrokeOrder as StrokeOrderData,
  type StrokeOrderLabels,
  strokeOrderLabels
} from '@zenbu/dictionary-core/detail/strokes'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PencilLineIcon,
  PlayIcon
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'

const strokeDurationMs = { play: 8 * 60, step: 12 * 80 } as const
const appGridPoints = 350
const appStrokeWidthPoints = 7
const strokeWidthPerSide = appStrokeWidthPoints / appGridPoints
const startDotRadiusPerSide = 0.04

interface Progress {
  completed: number
  active: number
}

export function StrokeOrder({ character, order }: { character: string; order: StrokeOrderData }) {
  const [open, setOpen] = useState(false)
  const [opening, setOpening] = useState(0)
  const wide = useMediaQuery('(min-width: 768px)')
  const labels = strokeOrderLabels(character, order.strokes.length)
  const trigger = (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={labels.show}
      onClick={() => {
        setOpening(value => value + 1)
        setOpen(true)
      }}
    >
      <PencilLineIcon />
    </Button>
  )
  const content = <StrokeOrderPlayer key={opening} order={order} labels={labels} />
  if (wide) {
    return (
      <>
        {trigger}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{labels.title}</DialogTitle>
            </DialogHeader>
            {content}
          </DialogContent>
        </Dialog>
      </>
    )
  }
  return (
    <>
      {trigger}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{labels.title}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4">{content}</div>
        </DrawerContent>
      </Drawer>
    </>
  )
}

function StrokeOrderPlayer({
  order,
  labels
}: {
  order: StrokeOrderData
  labels: StrokeOrderLabels
}) {
  const count = order.strokes.length
  const [progress, setProgress] = useState<Progress>({ completed: 0, active: 0 })
  const [mode, setMode] = useState<keyof typeof strokeDurationMs | null>(null)
  const [presses, setPresses] = useState(0)
  const latestProgress = useRef(progress)
  const update = useCallback((next: Progress) => {
    latestProgress.current = next
    setProgress(next)
  }, [])

  useEffect(() => {
    if (!mode) return
    void presses
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const { completed, active } = latestProgress.current
      if (completed >= count) {
        setMode(null)
        return
      }
      const drawn = active + (now - last) / strokeDurationMs[mode]
      last = now
      if (drawn < 1) {
        update({ completed, active: drawn })
        frame = requestAnimationFrame(tick)
        return
      }
      update({ completed: completed + 1, active: 0 })
      if (mode === 'play' && completed + 1 < count) frame = requestAnimationFrame(tick)
      else setMode(null)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [mode, presses, count, update])

  const playing = mode === 'play'
  const pause = () => setMode(null)

  function previous() {
    pause()
    const { completed, active } = latestProgress.current
    update(
      active > 0 ? { completed, active: 0 } : { completed: Math.max(0, completed - 1), active: 0 }
    )
  }

  function next() {
    pause()
    const { completed } = latestProgress.current
    if (completed >= count) return
    update({ completed, active: 0.001 })
    setMode('step')
    setPresses(value => value + 1)
  }

  function playOrPause() {
    if (playing) return pause()
    if (latestProgress.current.completed >= count) update({ completed: 0, active: 0 })
    setMode('play')
    setPresses(value => value + 1)
  }

  const status =
    progress.active > 0 ? labels.drawing[progress.completed] : labels.complete[progress.completed]

  return (
    <div className="flex flex-col items-center gap-4">
      <StrokeGrid label={labels.grid} order={order} progress={progress} />
      <span className="sr-only" aria-live="polite">
        {status}
      </span>
      <div className="flex items-center gap-12">
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label={labels.previous}
          disabled={progress.completed === 0 && progress.active === 0}
          onClick={previous}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label={playing ? labels.pause : labels.play}
          onClick={playOrPause}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label={labels.next}
          disabled={progress.completed === count}
          onClick={next}
        >
          <ChevronRightIcon />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {labels.position[progress.completed]}
      </p>
    </div>
  )
}

function StrokeGrid({
  label,
  order,
  progress
}: {
  label: string
  order: StrokeOrderData
  progress: Progress
}) {
  const size = order.viewportSize
  const next = order.strokes[progress.completed]
  const line = { vectorEffect: 'non-scaling-stroke' as const }
  const numberedStrokes = order.strokes.map((stroke, index) => ({
    stroke,
    strokeNumber: index + 1
  }))
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      className="aspect-square w-full max-w-72 bg-background"
    >
      <g className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="5 4" fill="none">
        <rect x={0} y={0} width={size} height={size} {...line} />
        <line x1={size / 2} y1={0} x2={size / 2} y2={size} {...line} />
        <line x1={0} y1={size / 2} x2={size} y2={size / 2} {...line} />
      </g>
      <g
        fill="none"
        strokeWidth={size * strokeWidthPerSide}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {numberedStrokes.map(({ stroke, strokeNumber }) => (
          <path
            key={strokeNumber}
            d={stroke.path}
            className={
              strokeNumber <= progress.completed
                ? 'stroke-foreground'
                : 'stroke-muted-foreground/50'
            }
          />
        ))}
        {next && progress.active > 0 ? (
          <path
            d={next.path}
            className="stroke-destructive"
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={1 - progress.active}
          />
        ) : null}
      </g>
      {next && progress.active === 0 ? (
        <circle
          cx={next.start.x}
          cy={next.start.y}
          r={size * startDotRadiusPerSide}
          className="fill-destructive"
        />
      ) : null}
    </svg>
  )
}
