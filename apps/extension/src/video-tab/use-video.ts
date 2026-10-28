import { useCallback, useEffect, useState } from 'react'
import type { CaptionsAnswer } from '../captions/messages'
import { failure } from '../shared/messages'
import type { Playback } from '../video/follower'
import type { WatchedVideo } from './active-tab'
import type { VideoTabServices } from './services'

const otherVideo = (answer: CaptionsAnswer, videoId: string) =>
  'videoId' in answer && answer.videoId !== videoId

export function useCaptions(services: VideoTabServices, { tabId, videoId }: WatchedVideo) {
  const [answer, setAnswer] = useState<CaptionsAnswer | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    let heard = false
    const stop = services.watchCaptions(change => {
      if (!live || change.tabId !== tabId || change.captions.videoId !== videoId) return
      heard = true
      setAnswer(change.captions)
    })
    services
      .askCaptions({ type: attempt === 0 ? 'captions' : 'try-again', tabId })
      .catch((error: unknown) => failure(error))
      .then(answered => {
        if (live && !heard && !otherVideo(answered, videoId)) setAnswer(answered)
      })
    return () => {
      live = false
      stop()
    }
  }, [services, tabId, videoId, attempt])
  const tryAgain = useCallback(() => setAttempt(count => count + 1), [])
  return { answer, tryAgain }
}

export function usePlayback(
  services: VideoTabServices,
  { tabId, videoId }: WatchedVideo,
  shown: boolean
): Playback | null {
  const [playback, setPlayback] = useState<Playback | null>(null)
  useEffect(() => {
    if (!shown) return
    const stop = services.followPlayback(tabId, heard =>
      setPlayback(heard?.videoId === videoId ? heard : null)
    )
    return () => {
      stop()
      setPlayback(null)
    }
  }, [services, tabId, videoId, shown])
  return playback
}
