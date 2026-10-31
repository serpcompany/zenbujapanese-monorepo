import type { ShadowMount } from '../src/content/shadow-mount'
import {
  askSettings,
  isZenbuOn,
  onSettingsChanged,
  readingAidKeys,
  type Settings
} from '../src/shared/settings'

export function ReadingAidStates({ settings }: { settings: Settings }) {
  return (
    <ul data-test="reading-aids" className="m-4 flex flex-col gap-1 text-sm">
      {readingAidKeys.map(aid => (
        <li key={aid} data-reading-aid={aid} data-on={settings[aid]}>
          {aid}: {settings[aid] ? 'on' : 'off'}
        </li>
      ))}
    </ul>
  )
}

type Runtime = NonNullable<Parameters<typeof askSettings>[0]> & {
  onMessage: NonNullable<Parameters<typeof onSettingsChanged>[1]>
}

export function followSettings(
  mount: (settings: Settings) => ShadowMount,
  host: string = location.hostname,
  runtime: Runtime = chrome.runtime
): () => void {
  let mounted: ShadowMount | null = null
  let heard = false
  const show = (settings: Settings) => {
    mounted?.unmount()
    mounted = isZenbuOn(host, settings) ? mount(settings) : null
  }
  const stopListening = onSettingsChanged(settings => {
    heard = true
    show(settings)
  }, runtime.onMessage)
  askSettings(runtime).then(settings => {
    if (!heard) show(settings)
  })
  return () => {
    stopListening()
    mounted?.unmount()
    mounted = null
  }
}
