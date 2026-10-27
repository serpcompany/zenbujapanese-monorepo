export type SettingValue = string | number | boolean

export type SettingKind =
  | { kind: 'boolean' }
  | { kind: 'choice'; choices: readonly string[] }
  | { kind: 'number'; least: number; most: number }
  | { kind: 'text'; pattern: RegExp; most: number }

interface SettingRule {
  value: SettingKind
  means: string
}

const onOff: SettingKind = { kind: 'boolean' }
const packId = '[a-z0-9][a-z0-9.-]{0,99}'

export const settingRules: Readonly<Record<string, SettingRule>> = {
  'readingAids.furigana': { value: onOff, means: 'Reading Aids: furigana over kanji.' },
  'readingAids.romaji': { value: onOff, means: 'Reading Aids: romaji under Japanese.' },
  'readingAids.wordMeanings': { value: onOff, means: "Reading Aids: each word's meaning." },
  'readingAids.kanjiMeanings': { value: onOff, means: "Reading Aids: each kanji's meaning." },
  'readingAids.translations': { value: onOff, means: 'Reading Aids: translations.' },
  'readingAids.translationLanguage': {
    value: { kind: 'text', pattern: /^[a-z]{2,3}(-[A-Za-z0-9]{1,8})*$/, most: 35 },
    means: 'Reading Aids: the language translations are in, as a language tag, such as `en`.'
  },
  'readingAids.translationSource': {
    value: { kind: 'choice', choices: ['youTube', 'apple'] },
    means:
      "Reading Aids: where translations come from: YouTube's captions, or Apple's on the device."
  },
  'readingAids.furiganaHiddenOnKnownWords': {
    value: onOff,
    means: 'Reading Aids: no furigana over the words the learner knows.'
  },
  'translate.furigana': { value: onOff, means: "Translate's own furigana switch." },
  'translate.speechSpeed': {
    value: { kind: 'number', least: 0.5, most: 2 },
    means: 'How fast Translate speaks: 1 is normal speed.'
  },
  'search.sort': {
    value: {
      kind: 'text',
      pattern: new RegExp(`^(default|known-words|frequency\\|${packId})$`),
      most: 120
    },
    means:
      "Search results' Sorted by: `default`, `known-words`, or `frequency|` and a frequency dictionary's family."
  },
  'search.filter': {
    value: { kind: 'choice', choices: ['all', 'known', 'unknown', 'learning'] },
    means: "Search results' filter."
  },
  'imageSearch.textView': {
    value: { kind: 'choice', choices: ['photo', 'both', 'text', 'translate'] },
    means: "Image Search's view: the photo, the photo and its text, the text, or its translation."
  },
  'frequencyDictionaries.chosen': {
    value: { kind: 'text', pattern: new RegExp(`^(${packId}(,${packId}){0,49})?$`), most: 5_000 },
    means:
      'The frequency dictionaries the learner chose, by pack ID, in their order, separated by commas: at most 50, and empty for none. Each device downloads its own copy.'
  }
}

export function valueText(name: string): string {
  const kind = settingRules[name]?.value
  if (kind?.kind === 'boolean') return '`true` or `false`'
  if (kind?.kind === 'choice') {
    return `one of ${kind.choices.map(each => `\`${each}\``).join(', ')}`
  }
  if (kind?.kind === 'number') return `a number from ${kind.least} to ${kind.most}`
  return `text of at most ${(kind?.most ?? 0).toLocaleString('en-US')} characters matching \`${kind?.kind === 'text' ? kind.pattern.source : ''}\``
}

function checked(kind: SettingKind, value: unknown): SettingValue | null {
  if (kind.kind === 'boolean') return typeof value === 'boolean' ? value : null
  if (kind.kind === 'number') {
    const fits = typeof value === 'number' && Number.isFinite(value)
    return fits && value >= kind.least && value <= kind.most ? value : null
  }
  if (typeof value !== 'string') return null
  if (kind.kind === 'choice') return kind.choices.includes(value) ? value : null
  return value.length <= kind.most && kind.pattern.test(value) ? value : null
}

const ruleOf = (name: string | undefined) =>
  name !== undefined && Object.hasOwn(settingRules, name) ? settingRules[name] : undefined

export function settingValue(name: string | undefined, value: unknown): SettingValue | null {
  const rule = ruleOf(name)
  return rule ? checked(rule.value, value) : null
}

export const isSetting = (name: string | undefined) => ruleOf(name) !== undefined
