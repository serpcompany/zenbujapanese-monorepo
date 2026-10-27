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

export const readSettings = (): Promise<Settings> => Promise.resolve(settingDefaults)
export const writeSettings = (_changes: Partial<Settings>): Promise<void> => Promise.resolve()
export const watchSettings =
  (_listener: (settings: Settings) => void): (() => void) =>
  () =>
    undefined
export const isZenbuOn = (host: string, settings: Settings): boolean =>
  !settings['sites.off'].includes(host)
