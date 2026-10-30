import { defaultFrequencyPacks } from '@zenbu/dictionary-core/detail/frequency'

const bundledPacks = defaultFrequencyPacks.map(pack => pack.id)

export type CaptionPlace = { x: number; y: number }

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
  'videos.captionPlace': null as CaptionPlace | null,
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

type SettingsWrite = { target: 'service-worker'; settings: 'write'; changes: Partial<Settings> }

type SettingsChanged = { target: 'settings'; settings: Settings }

type Sender = { sendMessage(message: SettingsRequest | SettingsWrite): Promise<unknown> }

type MessageEvents = {
  addListener(listener: (message: unknown) => boolean): void
  removeListener(listener: (message: unknown) => boolean): void
}

const settingKeys = Object.keys(settingDefaults) as SettingKey[]

const localStore = (): SettingsStore => chrome.storage.local

const isRecord = (value: unknown): value is Stored => typeof value === 'object' && value !== null

const isSettingKey = (key: string): key is SettingKey => Object.hasOwn(settingDefaults, key)

const isShare = (value: unknown) => typeof value === 'number' && value >= 0 && value <= 1

const isCaptionPlace = (value: unknown): value is CaptionPlace =>
  isRecord(value) && isShare(value.x) && isShare(value.y)

function sameKind(value: unknown, fallback: unknown): boolean {
  if (Array.isArray(fallback)) {
    return Array.isArray(value) && value.every(item => typeof item === 'string')
  }
  return typeof value === typeof fallback
}

const fits = (key: SettingKey, value: unknown) =>
  key === 'videos.captionPlace' ? isCaptionPlace(value) : sameKind(value, settingDefaults[key])

export function settingFrom<K extends SettingKey>(key: K, value: unknown): Settings[K] {
  return fits(key, value) ? (value as Settings[K]) : settingDefaults[key]
}

export function settingsFrom(stored: Stored): Settings {
  return Object.fromEntries(
    settingKeys.map(key => [key, settingFrom(key, stored[key])])
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

export const fittingChanges = (changes: Stored): Partial<Settings> =>
  Object.fromEntries(
    Object.entries(changes).filter(([key, value]) => isSettingKey(key) && fits(key, value))
  ) as Partial<Settings>

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

export const isSettingsWrite = (message: unknown): message is SettingsWrite =>
  isRecord(message) &&
  message.target === settingsRequest.target &&
  message.settings === 'write' &&
  isRecord(message.changes)

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

export function askToWriteSettings(
  changes: Partial<Settings>,
  sender: Sender = chrome.runtime
): Promise<void> {
  return Promise.resolve()
    .then(() => sender.sendMessage({ target: 'service-worker', settings: 'write', changes }))
    .then(answer => {
      if (!isRecord(answer) || answer.type !== 'written') {
        throw new Error('The service worker kept no settings.')
      }
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
