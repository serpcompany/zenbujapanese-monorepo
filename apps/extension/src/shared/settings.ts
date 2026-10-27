import { defaultFrequencyPacks } from '@zenbu/dictionary-core/detail/frequency'

const bundledPacks = defaultFrequencyPacks.map(pack => pack.id)

export const settingDefaults = {
  'readingAids.furigana': true,
  'readingAids.furiganaHiddenOnKnownWords': false,
  'readingAids.wordMeanings': false,
  'readingAids.romaji': false,
  'readingAids.translations': true,
  'frequencyDictionaries.chosen': bundledPacks,
  'frequencyDictionaries.order': bundledPacks,
  'sites.off': [] as string[],
  'videos.zenbuCaptions': true,
  'crashReports.send': true
}

export type Settings = typeof settingDefaults
export type SettingKey = keyof Settings

export const readingAidKeys = [
  'readingAids.furigana',
  'readingAids.furiganaHiddenOnKnownWords',
  'readingAids.wordMeanings',
  'readingAids.romaji',
  'readingAids.translations'
] as const satisfies SettingKey[]

type Stored = Record<string, unknown>

export type SettingsStore = {
  get(keys: string[]): Promise<Stored>
  set(items: Stored): Promise<void>
  onChanged: {
    addListener(listener: (changes: Stored) => void): void
    removeListener(listener: (changes: Stored) => void): void
  }
}

type SettingsRequest = { target: 'service-worker'; settings: 'read' }

type SettingsChanged = { target: 'settings'; settings: Settings }

type Sender = { sendMessage(message: SettingsRequest): Promise<unknown> }

type MessageEvents = {
  addListener(listener: (message: unknown) => boolean): void
  removeListener(listener: (message: unknown) => boolean): void
}

const settingKeys = Object.keys(settingDefaults) as SettingKey[]

const localStore = (): SettingsStore => chrome.storage.local

const isRecord = (value: unknown): value is Stored => typeof value === 'object' && value !== null

const isSettingKey = (key: string): key is SettingKey => Object.hasOwn(settingDefaults, key)

function sameKind(value: unknown, fallback: unknown): boolean {
  if (Array.isArray(fallback)) {
    return Array.isArray(value) && value.every(item => typeof item === 'string')
  }
  return typeof value === typeof fallback
}

export function settingsFrom(stored: Stored): Settings {
  return Object.fromEntries(
    settingKeys.map(key => [
      key,
      sameKind(stored[key], settingDefaults[key]) ? stored[key] : settingDefaults[key]
    ])
  ) as Settings
}

export function readSettings(store: SettingsStore = localStore()): Promise<Settings> {
  return store.get(settingKeys).then(settingsFrom)
}

export function writeSettings(
  changes: Partial<Settings>,
  store: SettingsStore = localStore()
): Promise<void> {
  return store.set(changes)
}

export function watchSettings(
  listener: (settings: Settings) => void,
  store: SettingsStore = localStore()
): () => void {
  const changed = (changes: Stored) => {
    if (Object.keys(changes).some(isSettingKey)) readSettings(store).then(listener, () => undefined)
  }
  store.onChanged.addListener(changed)
  return () => store.onChanged.removeListener(changed)
}

export const isZenbuOn = (host: string, settings: Settings): boolean =>
  !settings['sites.off'].includes(host)

export function sitesOffWith(host: string, on: boolean, settings: Settings): string[] {
  const others = settings['sites.off'].filter(site => site !== host)
  return on ? others : [...others, host]
}

export const settingsRequest: SettingsRequest = { target: 'service-worker', settings: 'read' }

export const isSettingsRequest = (message: unknown): message is SettingsRequest =>
  isRecord(message) &&
  message.target === settingsRequest.target &&
  message.settings === settingsRequest.settings

export const settingsChanged = (settings: Settings): SettingsChanged => ({
  target: 'settings',
  settings
})

const isSettingsChanged = (message: unknown): message is SettingsChanged =>
  isRecord(message) && message.target === 'settings' && isRecord(message.settings)

export function askSettings(sender: Sender = chrome.runtime): Promise<Settings> {
  return Promise.resolve()
    .then(() => sender.sendMessage(settingsRequest))
    .then(answer => {
      if (!isRecord(answer) || answer.type === 'failed') {
        throw new Error('The service worker answered without the settings.')
      }
      return settingsFrom(answer)
    })
}

export function onSettingsChanged(
  listener: (settings: Settings) => void,
  events: MessageEvents = chrome.runtime.onMessage
): () => void {
  const heard = (message: unknown) => {
    if (isSettingsChanged(message)) listener(settingsFrom(message.settings))
    return false
  }
  events.addListener(heard)
  return () => events.removeListener(heard)
}
