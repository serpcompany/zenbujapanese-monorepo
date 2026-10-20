import {
  applied,
  type Change,
  conflict,
  type Entity,
  gone,
  journaled,
  needsBaseVersion,
  rejected
} from './entities'
import type { Setting, SettingValue } from './kept-store'
import { rejection } from './profile'

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
    value: { kind: 'choice', choices: ['all', 'known', 'unknown'] },
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

const unknownSetting = rejection(
  'unknown_setting',
  'This service syncs no setting of that name. Keep it on the device, and send it again once the service knows it.'
)
const badValue = (name: string) =>
  rejection('invalid_fields', `A setting's \`set\` has value, and only value: ${valueText(name)}.`)

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

const asChange = (setting: Setting): Change => ({
  entity: 'setting',
  entityId: setting.name,
  operation: 'put',
  version: setting.version,
  data: { name: setting.name, value: setting.value }
})

export const settings: Entity = {
  reads: 'settings:read',
  operations: {
    set: {
      needs: ['settings:write'],
      async apply(account, mutation) {
        const name = mutation.entityId
        const rule = ruleOf(name)
        if (!name || !rule) return rejected(unknownSetting)
        if (mutation.baseVersion === undefined) return rejected(needsBaseVersion)
        const fields = mutation.fields ?? {}
        const value = checked(rule.value, fields.value)
        if (value === null || Object.keys(fields).length !== 1) return rejected(badValue(name))
        const current = await account.setting(name)
        const version = current?.version ?? 0
        if (current?.value === value) return applied(version)
        if (mutation.baseVersion !== version) {
          return conflict(current ? asChange(current) : gone('setting', name, 0))
        }
        await account.saveSetting({ name, value, version: version + 1 })
        return journaled(account, 'setting', name, version + 1, 'set')
      }
    }
  },
  async current(reader, entityId) {
    const setting = await reader.setting(entityId)
    return setting ? asChange(setting) : gone('setting', entityId, 0)
  }
}
