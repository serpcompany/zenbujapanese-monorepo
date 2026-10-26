import listName from '../../cases/list-name.json'
import name from '../../cases/name.json'
import noteText from '../../cases/note-text.json'
import recentOrder from '../../cases/recent-order.json'
import settings from '../../cases/settings.json'
import signInCode from '../../cases/sign-in-code.json'
import username from '../../cases/username.json'
import watchFields from '../../cases/watch-fields.json'
import type { SettingKind } from '../settings'
import type { WatchNumber } from '../watch'

export type Text =
  | string
  | { text: string; times: number; around?: string; before?: string; after?: string }

export interface Case {
  covers: string
  typed: Text
}

export const textOf = (value: Text) =>
  typeof value === 'string'
    ? value
    : `${value.before ?? value.around ?? ''}${value.text.repeat(value.times)}${value.after ?? value.around ?? ''}`

export const nameCases = name as {
  rule: string
  accepted: (Case & { name: Text })[]
  refused: Case[]
}

export const usernameCases = username as {
  rule: string
  accepted: (Case & { username: Text })[]
  refused: Case[]
  removes: Case[]
}

export const signInCodeCases = signInCode as {
  length: number
  accepted: (Case & { code: string })[]
  refused: Case[]
}

export const listNameCases = listName as {
  most: number
  accepted: (Case & { name: Text; cutToFit?: true })[]
  refused: Case[]
}

export const noteTextCases = noteText as {
  most: number
  accepted: (Case & { text: Text })[]
  refused: (Case & { blank?: true })[]
}

export const watchFieldCases = watchFields as {
  textLength: number
  texts: (Case & { sent: Text | null })[]
  numbers: { covers: string; field: WatchNumber; value: number; fits: boolean }[]
}

export const recentOrderCases = recentOrder as {
  videos: { ids: string[]; newestFirst: string[] }
}

export const settingCases = settings as {
  settings: {
    name: string
    kind: SettingKind['kind']
    choices?: string[]
    least?: number
    most?: number
    pattern?: string
    accepted: unknown[]
    refused: unknown[]
  }[]
}
