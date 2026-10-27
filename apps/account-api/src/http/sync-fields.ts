import { z } from '@hono/zod-openapi'
import { bookmarkLimits } from '../domain/bookmarks'
import { itemTextLength } from '../domain/entities'
import { profileLimits } from '../domain/profile'
import { watchLimits } from '../domain/watch-history'
import { listLimits } from '../domain/word-lists'
import { wordStates } from '../domain/word-states'

export const count = (value: number) => value.toLocaleString('en-US')

const { min, max } = profileLimits.usernameLength
export const ItemFields = z.object({
  headword: z.string().min(1).max(itemTextLength).openapi({
    description:
      'The word as the app shows it, kept in Unicode NFC and trimmed, with no control characters.'
  }),
  reading: z
    .string()
    .max(itemTextLength)
    .optional()
    .openapi({ description: 'Its reading, held as `headword` is. Empty when left out.' })
})

const WordStateFields = z.object({
  state: z.enum(wordStates).openapi({ description: 'The state the word moves to.' }),
  headword: ItemFields.shape.headword.optional().openapi({
    description:
      'The word as the app shows it, kept in Unicode NFC and trimmed, with no control characters. Needed for `learning` and `known`; for `unknown` it is not read, and the word keeps the text it has.'
  }),
  reading: ItemFields.shape.reading
})

const ProfileFields = z.strictObject({
  name: z
    .string()
    .optional()
    .openapi({
      description: `1 to ${profileLimits.nameLength} characters once trimmed, with runs of spaces made one, kept in Unicode NFC, and no control or invisible format characters.`
    }),
  username: z
    .string()
    .nullable()
    .optional()
    .openapi({
      description: `${min} to ${max} letters a to z, digits, or underscores after Unicode NFKC, trimming, and lowercasing, unique across accounts; \`null\` removes it.`
    })
})

const listName = z.string().openapi({
  description: `1 to ${listLimits.nameLength} characters once trimmed; control characters become spaces.`
})
const listPosition = z
  .int()
  .min(0)
  .max(listLimits.position)
  .openapi({ description: "Where the list sorts among the account's lists, lowest first." })

const ListFields = z.strictObject({ name: listName, position: listPosition })
const ListUpdateFields = z.strictObject({
  name: listName.optional(),
  position: listPosition.optional()
})

export const moment = z.iso.datetime({ offset: true }).openapi({
  description:
    "ISO 8601, from 2000 on, by the device's clock; a time after the service's is taken as the service's."
})
const seconds = z.number().min(0).max(watchLimits.seconds)
const shortText = z.string().openapi({
  description: `Cut to ${watchLimits.textLength} characters; control characters become spaces, and an empty one is left out.`
})

const WatchFields = z.strictObject({
  watchedAt: moment,
  title: shortText.optional(),
  author: shortText.optional().openapi({ description: 'The channel, held as `title` is.' }),
  duration: seconds.optional().openapi({ description: "The video's length, in seconds." }),
  position: seconds.optional().openapi({ description: 'Where the learner was, in seconds.' }),
  comprehension: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .openapi({ description: "The share of the captions' words the learner knows." })
})

const BookmarkFields = z.strictObject({
  text: z.string().openapi({
    description: `The sentence as it was said: not blank, cut to ${count(bookmarkLimits.textLength)} characters, with control characters made spaces.`
  }),
  translation: z
    .string()
    .nullable()
    .optional()
    .openapi({
      description: `Its translation, cut to ${count(bookmarkLimits.translationLength)} characters, or null; null when left out.`
    }),
  language: z.enum(['ja', 'en']).openapi({ description: 'The language it was said in.' }),
  bookmarkedAt: moment
})

export const studyFieldSchemas: readonly (readonly [string, z.ZodType])[] = [
  ['ProfileUpdateFields', ProfileFields],
  ['WordFields', ItemFields],
  ['WordStateFields', WordStateFields],
  ['ListCreateFields', ListFields],
  ['ListUpdateFields', ListUpdateFields],
  ['WatchFields', WatchFields],
  ['BookmarkFields', BookmarkFields]
]
