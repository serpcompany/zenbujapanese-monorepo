import { Button } from '@zenbu/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@zenbu/ui/components/dropdown-menu'
import {
  GaugeIcon,
  PauseIcon,
  PlayIcon,
  Repeat1Icon,
  SkipBackIcon,
  SkipForwardIcon
} from 'lucide-react'
import { playerCaptionLabels as labels } from './labels'
import { type LineControls, type LineView, speeds } from './line-controls'
import type { ControlsPresence } from './presence'

type Props = {
  controls: LineControls
  view: LineView
  presence: ControlsPresence
}

const barClass =
  'flex items-center gap-0.5 rounded-xl bg-black/70 p-1 text-white shadow-md transition-opacity duration-200 motion-reduce:transition-none data-hidden:pointer-events-none data-hidden:opacity-0'

export function PlayerControls({ controls, view, presence }: Props) {
  return (
    <div
      role="toolbar"
      aria-label={labels.controls}
      data-player-controls
      data-hidden={presence.shown ? undefined : ''}
      className={`pointer-events-auto ${barClass}`}
      {...presence.held}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={labels.previousLine}
        onClick={controls.previous}
      >
        <SkipBackIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={view.playing ? labels.pause : labels.play}
        onClick={controls.togglePlay}
      >
        {view.playing ? <PauseIcon /> : <PlayIcon />}
      </Button>
      <Button variant="ghost" size="icon" aria-label={labels.nextLine} onClick={controls.next}>
        <SkipForwardIcon />
      </Button>
      <Button
        variant={view.repeating ? 'secondary' : 'ghost'}
        size="icon"
        aria-label={labels.repeatLine}
        aria-pressed={view.repeating}
        onClick={controls.toggleRepeat}
      >
        <Repeat1Icon />
      </Button>
      <DropdownMenu open={presence.menuOpen} onOpenChange={presence.setMenuOpen}>
        <DropdownMenuTrigger
          render={<Button variant="ghost" aria-label={labels.speedMenu(view.rate)} />}
        >
          <GaugeIcon />
          <span className="tabular-nums">{labels.speed(view.rate)}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="pointer-events-auto w-auto">
          <DropdownMenuRadioGroup
            value={String(view.rate)}
            onValueChange={value => controls.setRate(Number(value))}
          >
            {speeds.map(speed => (
              <DropdownMenuRadioItem key={speed} value={String(speed)} closeOnClick>
                {labels.speed(speed)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
