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

export const furiganaSlug = 'kanji-to-furigana'

export const toolSlugs = [...converterSlugs, furiganaSlug] as const

export type ToolSlug = (typeof toolSlugs)[number]

export const isConverterSlug = (value: string): value is ConverterSlug =>
  (converterSlugs as readonly string[]).includes(value)

export const converterPath = (slug: ToolSlug) => `${toolsPath}${slug}/`

export const furiganaReadingsPath = '/tools/furigana.json'

export const toolPaths: readonly string[] = [toolsPath, ...toolSlugs.map(converterPath)]
