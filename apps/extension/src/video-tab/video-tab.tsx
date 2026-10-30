import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { Button } from '@zenbu/ui/components/button'
import { CaptionsOff, History, MonitorPlay } from 'lucide-react'
import { useEffect, useState } from 'react'
import { captionLabels } from '../captions/labels'
import type { CaptionsAnswer } from '../captions/messages'
import type { Settings } from '../shared/settings'
import { ModelNotice } from '../shared/translation-model'
import { useSettings } from '../shared/use-settings'
import { EmptyState, emptyTab, SignUpButton } from '../side-panel/empty-tab'
import { labels as panelLabels } from '../side-panel/labels'
import type { PanelTabProps } from '../side-panel/route'
import { translateLabels } from '../translate/labels'
import { useActiveTab, type WatchedVideo, watchedIn } from './active-tab'
import { videoTabLabels } from './labels'
import { onDeviceVideoServices, type VideoTabServices } from './services'
import { Transcript } from './transcript'
import { useEnglish } from './use-english'
import { useCaptions, usePlayback } from './use-video'

type Shared = { services: VideoTabServices; open: PanelTabProps['open'] }

function NoVideo({ select }: Pick<PanelTabProps, 'select'>) {
  return (
    <div className="flex flex-col">
      <EmptyState icon={MonitorPlay} text={panelLabels.empty.video} />
      <section data-recent className="border-t">
        <h2 className="px-4 pt-4 font-heading text-base font-medium">{panelLabels.recent}</h2>
        <EmptyState icon={History} text={panelLabels.empty.recent}>
          <SignUpButton select={select} />
        </EmptyState>
      </section>
    </div>
  )
}

const NoJapaneseCaptions = emptyTab(CaptionsOff, { title: captionLabels.noJapaneseCaptions })

const minute = 60_000

const noteClass = 'text-sm text-muted-foreground'

const noEnglish: ReadonlyMap<string, string> = new Map()

const noFailures: ReadonlySet<string> = new Set()

const englishText = {
  asks: videoTabLabels.englishNeedsDownload,
  unavailable: translateLabels.notices.unavailable
}

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

function ReloadNotice({ reload }: { reload(): void }) {
  return (
    <div data-reload-notice className="flex items-center gap-3">
      <p className={`${noteClass} flex-1`}>{videoTabLabels.reloadToFollow}</p>
      <Button variant="outline" size="sm" onClick={reload}>
        {videoTabLabels.reload}
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
  const { translating, english, failed, translator, download, retry } = useEnglish(
    lines,
    translations,
    shared.services
  )
  const { playback, unreachable } = usePlayback(shared.services, video, shown)
  return (
    <>
      {unreachable && <ReloadNotice reload={() => shared.services.reload(video.tabId)} />}
      {translating && <ModelNotice model={translator} download={download} text={englishText} />}
      <Transcript
        lines={lines}
        english={translations ? english : noEnglish}
        failed={translations ? failed : noFailures}
        retry={retry}
        playback={playback}
        tabId={video.tabId}
        shown={shown}
        settings={settings}
        services={shared.services}
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
  select,
  ...shared
}: Shared & Pick<PanelTabProps, 'select'> & { video: WatchedVideo; shown: boolean }) {
  const { answer, tryAgain } = useCaptions(shared.services, video)
  const settings = useSettings()
  if (answer && 'state' in answer && answer.state === 'no-video') return <NoVideo select={select} />
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
  select,
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
    else setOpened(current => (current === key ? current : null))
  }, [shown, key])
  if (video === undefined) return null
  if (video === null) return <NoVideo select={select} />
  if (key !== opened) return null
  return (
    <VideoCaptions
      key={key}
      video={video}
      shown={shown}
      services={services}
      open={open}
      select={select}
    />
  )
}
