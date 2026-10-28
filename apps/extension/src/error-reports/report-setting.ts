import type { BrowserClient } from '@sentry/browser'
import { type SettingKey, settingFrom } from '../shared/settings'

export type MakeTransport = NonNullable<ConstructorParameters<typeof BrowserClient>[0]['transport']>

export type Transport = ReturnType<MakeTransport>

export const sendSettingKey = 'crashReports.send' satisfies SettingKey

export type SettingStorage = {
  get(key: string): Promise<Record<string, unknown>>
  onChanged: {
    addListener(listener: (changes: Record<string, { newValue?: unknown }>) => void): void
  }
}

export function sendSetting(storage: SettingStorage): () => Promise<boolean> {
  let sends: boolean | undefined
  const read = Promise.resolve()
    .then(() => storage.get(sendSettingKey))
    .then(
      items => {
        sends ??= settingFrom(sendSettingKey, items[sendSettingKey])
      },
      () => {
        sends ??= false
      }
    )
  storage.onChanged.addListener(changes => {
    const change = changes[sendSettingKey]
    if (change) sends = settingFrom(sendSettingKey, change.newValue)
  })
  return () => read.then(() => sends === true)
}

export function gatedTransport(make: MakeTransport, sends: () => Promise<boolean>): MakeTransport {
  return options => {
    const inner = make(options)
    return {
      send: envelope => sends().then(allowed => (allowed ? inner.send(envelope) : {})),
      flush: timeout => inner.flush(timeout)
    }
  }
}
