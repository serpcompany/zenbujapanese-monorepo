import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { Button } from '@zenbu/ui/components/button'
import { CaptionsOff, MonitorPlay } from 'lucide-react'
import { useEffect, useState } from 'react'
import { captionLabels } from '../captions/labels'
import type { CaptionsAnswer } from '../captions/messages'
import type { Settings } from '../shared/settings'
import { useSettings } from '../shared/use-settings'
import { emptyTab } from '../side-panel/empty-tab'
import { labels as panelLabels } from '../side-panel/labels'
import type { PanelTabProps } from '../side-panel/route'
import { translateLabels } from '../translate/labels'
import { DownloadProgress } from '../translate/translate-tab'
import { useActiveTab, type WatchedVideo, watchedIn } from './active-tab'
import { videoTabLabels } from './labels'
import { onDeviceVideoServices, type VideoTabServices } from './services'
import { Transcript } from './transcript'
import { type Translator, useEnglish } from './use-english'
import { useCaptions, usePlayback } from './use-video'

type Shared = { services: VideoTabServices; open: PanelTabProps['open'] }

const NoVideo = emptyTab(MonitorPlay, panelLabels.empty.video)

const NoJapaneseCaptions = emptyTab(CaptionsOff, { title: captionLabels.noJapaneseCaptions })

const minute = 60_000

const noteClass = 'text-sm text-muted-foreground'

function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!ticking) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), minute / 4)
    return () => clearInterval(timer)
  }, [ticking])
  return now
}

function Notice({ text, tryAgain }: { text: string; tryAgain?(): void }) {
  return (
    <div data-captions-notice className="flex flex-col items-start gap-3">
      <p className={noteClass}>{text}</p>
      {tryAgain && (
        <Button variant="outline" size="sm" onClick={tryAgain}>
          {captionLabels.tryAgain}
        </Button>
      )}
    </div>
  )
}

function RateLimited({ retryAt, tryAgain }: { retryAt: number; tryAgain(): void }) {
  const now = useNow(true)
  return <Notice text={captionLabels.rateLimited(retryAt, now)} tryAgain={tryAgain} />
}

function EnglishNotice({ translator, download }: { translator: Translator; download(): void }) {
  if (translator.state === 'downloading') return <DownloadProgress fraction={translator.fraction} />
  if (translator.state === 'unavailable')
    return <p className={noteClass}>{translateLabels.notices.unavailable}</p>
  if (translator.state !== 'downloadable' && translator.state !== 'download-failed') return null
  return (
    <div data-english-notice className="flex items-center gap-3">
      <p className={`${noteClass} flex-1`}>
        {translator.state === 'downloadable'
          ? videoTabLabels.englishNeedsDownload
          : translateLabels.notices.downloadFailed}
      </p>
      <Button variant="outline" size="sm" onClick={download}>
        {videoTabLabels.download}
      </Button>
    </div>
  )
}

function Lines({
  lines,
  video,
  shown,
  settings,
  ...shared
}: Shared & { lines: Caption[]; video: WatchedVideo; shown: boolean; settings: Settings | null }) {
  const translations = settings?.['readingAids.translations'] === true
  const { english, translator, download } = useEnglish(lines, translations, shared.services)
  const playback = usePlayback(shared.services, video, shown)
  return (
    <>
      {translations && <EnglishNotice translator={translator} download={download} />}
      <Transcript
        lines={lines}
        english={translations ? english : new Map()}
        playback={playback}
        tabId={video.tabId}
        shown={shown}
        settings={settings}
        {...shared}
      />
    </>
  )
}

function CaptionsView({
  answer,
  tryAgain,
  ...lines
}: Shared & {
  answer: CaptionsAnswer | null
  tryAgain(): void
  video: WatchedVideo
  shown: boolean
  settings: Settings | null
}) {
  if (answer === null || !('state' in answer))
    return answer === null ? (
      <p className={noteClass}>{videoTabLabels.loading}</p>
    ) : (
      <Notice text={videoTabLabels.noAnswer} tryAgain={tryAgain} />
    )
  switch (answer.state) {
    case 'lines':
      return <Lines lines={answer.lines} {...lines} />
    case 'rate-limited':
      return <RateLimited retryAt={answer.retryAt} tryAgain={tryAgain} />
    case 'failed':
      return <Notice text={answer.reason} tryAgain={tryAgain} />
    default:
      return <p className={noteClass}>{videoTabLabels.loading}</p>
  }
}

function VideoCaptions({
  video,
  shown,
  ...shared
}: Shared & { video: WatchedVideo; shown: boolean }) {
  const { answer, tryAgain } = useCaptions(shared.services, video)
  const settings = useSettings()
  if (answer && 'state' in answer && answer.state === 'no-video')
    return <NoVideo open={shared.open} />
  if (answer && 'state' in answer && answer.state === 'no-japanese-captions')
    return <NoJapaneseCaptions open={shared.open} />
  return (
    <section data-video-tab className="flex flex-col gap-3 p-4">
      {video.title && (
        <h2 data-video-title className="font-heading text-base font-medium">
          {video.title}
        </h2>
      )}
      <CaptionsView
        answer={answer}
        tryAgain={tryAgain}
        video={video}
        shown={shown}
        settings={settings}
        {...shared}
      />
    </section>
  )
}

export function VideoTab({
  open,
  shown = true,
  services = onDeviceVideoServices
}: PanelTabProps & { services?: VideoTabServices }) {
  const [looked, setLooked] = useState(shown)
  const tab = useActiveTab(services, looked)
  const video = tab === undefined ? undefined : watchedIn(tab)
  const key = video ? `${video.tabId}:${video.videoId}` : null
  const [opened, setOpened] = useState<string | null>(null)
  useEffect(() => {
    if (shown) setLooked(true)
    if (shown && key) setOpened(key)
  }, [shown, key])
  if (video === undefined) return null
  if (video === null) return <NoVideo open={open} />
  if (key !== opened) return null
  return <VideoCaptions key={key} video={video} shown={shown} services={services} open={open} />
}
