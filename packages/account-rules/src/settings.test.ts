import { describe, expect, test } from 'vitest'
import { isSetting, type SettingKind, settingRules, settingValue } from './settings'
import { cases } from './test/cases'

interface SharedSetting {
  name: string
  kind: SettingKind['kind']
  choices?: string[]
  least?: number
  most?: number
  pattern?: string
  accepted: unknown[]
  refused: unknown[]
}

const shared = cases<{ settings: SharedSetting[] }>('settings').settings

const shapeOf = (kind: SettingKind) =>
  kind.kind === 'choice'
    ? { kind: kind.kind, choices: [...kind.choices] }
    : kind.kind === 'number'
      ? { kind: kind.kind, least: kind.least, most: kind.most }
      : kind.kind === 'text'
        ? { kind: kind.kind, pattern: kind.pattern.source, most: kind.most }
        : { kind: kind.kind }

describe('a setting', () => {
  test('is one the shared cases list, of the kind they give', () => {
    expect(shared.map(({ name }) => name)).toEqual(Object.keys(settingRules))
    for (const { name, accepted: _, refused: __, ...shape } of shared) {
      expect(shapeOf(settingRules[name]?.value as SettingKind), name).toEqual(shape)
    }
  })

  test('takes the values the shared cases accept and refuses the rest', () => {
    for (const { name, accepted, refused } of shared) {
      for (const value of accepted)
        expect(settingValue(name, value), `${name} ${value}`).toBe(value)
      for (const value of refused) expect(settingValue(name, value), `${name} ${value}`).toBeNull()
    }
  })

  test('is only one the service lists, never an inherited name', () => {
    expect(isSetting('theme.dark')).toBe(false)
    expect(isSetting('toString')).toBe(false)
    expect(isSetting(undefined)).toBe(false)
  })
})
