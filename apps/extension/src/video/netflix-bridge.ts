import { type CaptionTracks, noPlayer } from '../captions/messages'
import type { VideoControl } from './controls'
import { playerAnswerEvent, playerEvent, playerRequestEvent, readAnswer } from './netflix-protocol'

const tracksWait = 25_000

export type NetflixBridge = {
  control(videoId: string, control: VideoControl): void
  tracks(videoId: string): Promise<CaptionTracks>
}

export function netflixBridge(page: Document, wait = tracksWait): NetflixBridge {
  const waiting = new Map<number, (tracks: CaptionTracks) => void>()
  let asked = 0
  page.addEventListener(playerAnswerEvent, event => {
    const answer = readAnswer(event)
    if (answer) waiting.get(answer.id)?.(answer.tracks)
  })
  return {
    control(videoId, control) {
      page.dispatchEvent(playerEvent(playerRequestEvent, { id: 0, videoId, control }))
    },
    tracks(videoId) {
      asked += 1
      const id = asked
      return new Promise(resolve => {
        const answered = (tracks: CaptionTracks) => {
          clearTimeout(timer)
          waiting.delete(id)
          resolve(tracks)
        }
        const timer = setTimeout(() => answered(noPlayer), wait)
        waiting.set(id, answered)
        page.dispatchEvent(playerEvent(playerRequestEvent, { id, videoId, ask: 'tracks' }))
      })
    }
  }
}
