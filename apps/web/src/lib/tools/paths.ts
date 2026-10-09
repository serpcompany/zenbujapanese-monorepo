export const toolsPath = '/tools/'

export const converterSlugs = [
  'hiragana-to-katakana',
  'katakana-to-hiragana',
  'romaji-to-kana',
  'kana-to-romaji',
  'half-width-to-full-width',
  'full-width-to-half-width'
] as const

export type ConverterSlug = (typeof converterSlugs)[number]

export const isConverterSlug = (value: string): value is ConverterSlug =>
  (converterSlugs as readonly string[]).includes(value)

export const converterPath = (slug: ConverterSlug) => `${toolsPath}${slug}/`
