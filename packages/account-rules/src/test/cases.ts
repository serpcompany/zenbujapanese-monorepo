import { readFileSync } from 'node:fs'

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

export const cases = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../../cases/${name}.json`, import.meta.url), 'utf8')) as T
