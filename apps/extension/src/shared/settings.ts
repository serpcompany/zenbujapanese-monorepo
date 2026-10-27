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
