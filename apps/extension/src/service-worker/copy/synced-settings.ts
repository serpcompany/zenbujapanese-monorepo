import { type SettingValue, settingValue } from '@zenbu/account-rules/settings'
import type { AccountOnlySetting } from '../../shared/account-copy'
import { type Settings, settingDefaults } from '../../shared/settings'
import { type Draft, type Item, itemKey, keyOf, queuedKey } from './kept'

const syncedSettings = [
  'readingAids.furigana',
  'readingAids.romaji',
  'readingAids.wordMeanings',
  'readingAids.furiganaHiddenOnKnownWords',
  'readingAids.translations',
  'frequencyDictionaries.chosen'
] as const satisfies (keyof Settings)[]

type Synced = (typeof syncedSettings)[number]

const accountOnlySettings: readonly AccountOnlySetting[] = [
  'readingAids.translationLanguage',
  'readingAids.translationSource'
]

const kept: ReadonlySet<string> = new Set([...syncedSettings, ...accountOnlySettings])

export const isKeptSetting = (name: string) => kept.has(name)

export const isSyncedSetting = (name: string): name is Synced =>
  (syncedSettings as readonly string[]).includes(name)

function accountValueOf(name: Synced, value: Settings[Synced]): SettingValue | null {
  return settingValue(name, Array.isArray(value) ? value.join(',') : value)
}

function browserValueOf(name: Synced, value: unknown): Settings[Synced] | null {
  const checked = settingValue(name, value)
  if (checked === null) return null
  if (name !== 'frequencyDictionaries.chosen') return typeof checked === 'boolean' ? checked : null
  return checked === '' ? [] : String(checked).split(',')
}

const accountHolds = (item: Item | undefined): SettingValue | undefined =>
  item?.data ? (item.data.value as SettingValue) : undefined

export function reconcile(draft: Draft, browser: Settings, newId: () => string): Partial<Settings> {
  const meta = draft.meta
  if (!meta) return {}
  const taken: Item[] = []
  for (const name of syncedSettings) {
    const key = keyOf('setting', name)
    const item = draft.get(key)
    const ours = accountValueOf(name, browser[name])
    const queued = meta.queue.filter(each => queuedKey(each) === key)
    const sent = queued.find(each => each.sent)
    const unsent = queued.find(each => !each.sent)
    const latest = sent
      ? sent.mutation.fields?.value
      : (accountHolds(item) ?? accountValueOf(name, settingDefaults[name]))
    const refused = meta.refused[name]
    if (refused !== undefined && refused !== JSON.stringify(ours)) delete meta.refused[name]
    if (ours === null || ours === latest || meta.refused[name] !== undefined) {
      if (unsent) {
        meta.queue = meta.queue.filter(each => each !== unsent)
        const deferred = sent ? undefined : meta.deferred.find(each => itemKey(each) === key)
        if (deferred) {
          meta.deferred = meta.deferred.filter(each => each !== deferred)
          draft.put(deferred)
          taken.push(deferred)
        }
      }
      continue
    }
    if (unsent) {
      if (unsent.mutation.fields?.value !== ours) delete unsent.refusedWith
      unsent.mutation = { ...unsent.mutation, fields: { value: ours } }
      continue
    }
    meta.queue.push({
      mutation: {
        id: newId(),
        entity: 'setting',
        operation: 'set',
        entityId: name,
        baseVersion: item?.version ?? 0,
        fields: { value: ours }
      },
      sent: false,
      before: null
    })
  }
  return browserWrites(taken, browser)
}

export function browserWrites(items: readonly Item[], browser: Settings): Partial<Settings> {
  const writes: Partial<Record<Synced, unknown>> = {}
  for (const item of items) {
    if (!isSyncedSetting(item.entityId) || !item.data) continue
    const value = browserValueOf(item.entityId, item.data.value)
    if (value !== null) writes[item.entityId] = value
  }
  const chosen = writes['frequencyDictionaries.chosen'] as string[] | undefined
  if (chosen) {
    const rest = browser['frequencyDictionaries.order'].filter(id => !chosen.includes(id))
    return { ...writes, 'frequencyDictionaries.order': [...chosen, ...rest] } as Partial<Settings>
  }
  return writes as Partial<Settings>
}

export function accountSettingsOf(items: readonly Item[]) {
  return Object.fromEntries(
    items.flatMap(item =>
      accountOnlySettings.includes(item.entityId as AccountOnlySetting) &&
      typeof item.data?.value === 'string'
        ? [[item.entityId, item.data.value]]
        : []
    )
  ) as Partial<Record<AccountOnlySetting, string>>
}
