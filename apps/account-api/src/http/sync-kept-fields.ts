import { z } from '@hono/zod-openapi'
import { photoLimits } from '../domain/photo-files'
import { searchLimits } from '../domain/recent-searches'
import { noteLimits } from '../domain/word-notes'
import { count, ItemFields, moment } from './sync-fields'

const savedItem = z.string().openapi({
  description:
    'A Language Reference ID (32 lowercase hex digits), `kanji:` and one kanji in Unicode NFC, or a note identity an earlier app saved (`wn1:` and 64 lowercase hex digits).'
})
const label = z
  .string()
  .max(noteLimits.labelLength)
  .nullable()
  .optional()
  .openapi({ description: "Held as a word's `headword` is; null, empty, or left out for none." })
const sha256 = z
  .string()
  .regex(/^[0-9a-f]{64}$/)
  .openapi({ description: 'The SHA-256 of a file the account holds, in 64 lowercase hex digits.' })

const NoteFields = z.strictObject({
  item: savedItem,
  text: z.string().openapi({
    description: `The note: 1 to ${count(noteLimits.textLength)} characters once trimmed, kept in Unicode NFC. Line breaks and tabs stay, and other control characters become spaces. Never cut: a longer note is refused.`
  }),
  headword: label.openapi({ description: 'The headword the note was saved on, if any.' }),
  reading: label.openapi({ description: 'Its reading, if any.' })
})

const PhotoFields = z.strictObject({
  name: z.string().openapi({
    description: `The photo's name, such as its file's. Cut to ${photoLimits.nameLength} characters, with control characters made spaces; it may be empty.`
  }),
  savedAt: moment
})

const PhotoWordFields = ItemFields.extend({ savedAt: moment }).strict()

const ProfilePhotoFields = z.strictObject({
  photoId: sha256.openapi({
    description: 'The SHA-256 of the photo file, uploaded first with `PUT /v1/photos/{photoId}`.'
  })
})

const SettingFields = z.strictObject({
  value: z.union([z.string(), z.number(), z.boolean()]).openapi({
    description: "The setting's value, of its kind: `x-sync-entities` lists each setting."
  })
})

const SearchFields = z.strictObject({
  query: z.string().openapi({
    description: `What was searched, as the app keeps it: 1 to ${count(searchLimits.queryLength)} characters, with no control characters. Its SHA-256, after Unicode NFC, is the \`entityId\`.`
  }),
  searchedAt: moment
})

export const keptFieldSchemas: readonly (readonly [string, z.ZodType])[] = [
  ['NoteFields', NoteFields],
  ['PhotoFields', PhotoFields],
  ['PhotoWordFields', PhotoWordFields],
  ['ProfilePhotoFields', ProfilePhotoFields],
  ['SettingFields', SettingFields],
  ['SearchFields', SearchFields]
]
