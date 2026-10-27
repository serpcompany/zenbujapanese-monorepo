import type { SettingStorage } from '../error-reports/report-setting'

type Listener = Parameters<SettingStorage['onChanged']['addListener']>[0]

export function settingStorage(items: Record<string, unknown> = {}, { held = false } = {}) {
  const listeners: Listener[] = []
  let release: () => void = () => undefined
  const read = held ? new Promise<void>(resolve => (release = resolve)) : Promise.resolve()
  const storage: SettingStorage = {
    get: key => read.then(() => (key in items ? { [key]: items[key] } : {})),
    onChanged: { addListener: listener => listeners.push(listener) }
  }
  return {
    storage,
    release: () => release(),
    set(key: string, value: unknown) {
      items[key] = value
      for (const listener of listeners) listener({ [key]: { newValue: value } })
    }
  }
}
