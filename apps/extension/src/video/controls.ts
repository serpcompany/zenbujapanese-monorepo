import type { VideoFollower } from './follower'

export type VideoControl =
  | { type: 'seek'; time: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'rate'; rate: number }

export type VideoControlMessage = { target: 'video'; control: VideoControl }

type Fields = Partial<Record<string, unknown>>

const fields = (value: unknown): Fields | undefined =>
  typeof value === 'object' && value !== null ? (value as Fields) : undefined

const isTime = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0
const isRate = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0

function isVideoControl(value: unknown): value is VideoControl {
  const control = fields(value)
  if (control?.type === 'seek') return isTime(control.time)
  if (control?.type === 'rate') return isRate(control.rate)
  return control?.type === 'play' || control?.type === 'pause'
}

export function isVideoControlMessage(message: unknown): message is VideoControlMessage {
  const envelope = fields(message)
  return envelope?.target === 'video' && isVideoControl(envelope.control)
}

export function applyControl(follower: VideoFollower, control: VideoControl): void {
  if (control.type === 'seek') follower.seek(control.time)
  else if (control.type === 'rate') follower.setRate(control.rate)
  else if (control.type === 'play') follower.play()
  else follower.pause()
}
