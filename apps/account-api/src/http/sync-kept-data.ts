import { z } from '@hono/zod-openapi'

export const WordNoteSchema = z
  .object({
    id: z.string(),
    itemId: z.string().openapi({ description: 'The word, kanji, or note identity it is on.' }),
    text: z.string(),
    headword: z.string().nullable(),
    reading: z.string().nullable()
  })
  .openapi('WordNote')

export const PhotoSchema = z
  .object({
    id: z.string().openapi({ description: 'The SHA-256 of its file: download it by this ID.' }),
    name: z.string(),
    savedAt: z.iso.datetime()
  })
  .openapi('Photo')

export const PhotoWordSchema = z
  .object({
    photoId: z.string(),
    itemId: z.string(),
    headword: z.string(),
    reading: z.string(),
    savedAt: z.iso.datetime()
  })
  .openapi('PhotoWord')

export const ProfilePhotoSchema = z
  .object({ photoId: z.string().openapi({ description: 'Download it by this ID.' }) })
  .openapi('ProfilePhoto')

export const SettingSchema = z
  .object({ name: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) })
  .openapi('Setting')

export const RecentSearchSchema = z
  .object({ id: z.string(), query: z.string(), searchedAt: z.iso.datetime() })
  .openapi('RecentSearch')

export const keptDeletes = [
  'wordNote',
  'photo',
  'photoWord',
  'profilePhoto',
  'setting',
  'recentSearch'
] as const
