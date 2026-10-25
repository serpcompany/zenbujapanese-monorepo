import listName from '../../cases/list-name.json'
import name from '../../cases/name.json'
import noteText from '../../cases/note-text.json'
import recentOrder from '../../cases/recent-order.json'
import settings from '../../cases/settings.json'
import signInCode from '../../cases/sign-in-code.json'
import username from '../../cases/username.json'
import watchFields from '../../cases/watch-fields.json'

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

const files = {
  'list-name': listName,
  name,
  'note-text': noteText,
  'recent-order': recentOrder,
  settings,
  'sign-in-code': signInCode,
  username,
  'watch-fields': watchFields
}

export const cases = <T>(file: keyof typeof files): T => files[file] as T
