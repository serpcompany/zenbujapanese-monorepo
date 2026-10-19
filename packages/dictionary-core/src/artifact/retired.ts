export const retiredEntriesFile = 'RetiredEntries.json'

const retiredEntriesSchema = 'zenbu.retired-entries.v1'

export interface RetiredEntriesFile {
  schema: string
  language_data_sha256: string
  entries: { ent_seq: number; retired_in: string; replacement: number | null }[]
}

export type RetiredEntries = Record<number, number | null>

const refuse = (message: string): never => {
  throw new Error(`Refusing the language data: ${retiredEntriesFile} ${message}`)
}

export function retiredEntries(
  file: RetiredEntriesFile,
  languageDataSha256: string
): RetiredEntries {
  if (file.schema !== retiredEntriesSchema) {
    refuse(`is ${file.schema}; the core reads ${retiredEntriesSchema}`)
  }
  if (file.language_data_sha256 !== languageDataSha256) {
    refuse(
      `was made for LanguageReferenceData ${file.language_data_sha256}, not ${languageDataSha256}`
    )
  }
  return Object.fromEntries(file.entries.map(entry => [entry.ent_seq, entry.replacement]))
}
