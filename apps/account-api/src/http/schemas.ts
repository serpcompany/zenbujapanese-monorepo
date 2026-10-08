import { z } from '@hono/zod-openapi'
import { bookmarkLimits } from '../domain/bookmarks'
import { profileLimits } from '../domain/profile'
import { syncLimits } from '../domain/sync'
import { watchLimits } from '../domain/watch-history'
import { errorObject } from './refusals'
import {
  entityIdsText,
  rejectionMeanings,
  syncEntitiesExtension,
  syncedEntityNames
} from './sync-entities'

const { min, max } = profileLimits.usernameLength

export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: 'unauthorized' }),
      message: z.string()
    })
  })
  .openapi('Error', {
    description:
      'Every error. `code` is stable and machine-readable; `message` is for people and may change.'
  })

export const ProfileSchema = z
  .object({
    id: z.string().openapi({ description: 'The Zenbu user ID. It never changes.' }),
    name: z.string(),
    username: z.string().nullable(),
    email: z.string().openapi({ description: "The account's email. It can't be changed here." }),
    version: z.int().min(1).openapi({
      description:
        'The profile revision. It goes up by one with each change, and jumps to the time in milliseconds when the service starts on a restored backup; send it back as `baseVersion` to change the profile.'
    }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime()
  })
  .openapi('Profile')

const nameSchema = z.string().openapi({
  description: `1 to ${profileLimits.nameLength} characters once trimmed, with runs of spaces made one and no control characters. Stored in Unicode NFC.`
})

const usernameSchema = z
  .string()
  .nullable()
  .openapi({
    description: `${min} to ${max} letters a to z, digits, or underscores, unique across accounts. It's normalized first (Unicode NFKC, trimmed, lowercased), so \`Kana_Fan\` is \`kana_fan\`. \`null\` removes it.`
  })

const baseVersionSchema = z.int().min(1).openapi({
  description:
    'The profile `version` this change was made to. If the profile has changed since, nothing is changed and the answer is a conflict with the current profile.'
})

export const ProfilePatchSchema = z
  .strictObject({
    baseVersion: baseVersionSchema,
    name: nameSchema.optional(),
    username: usernameSchema.optional()
  })
  .openapi('ProfilePatch')

export const DeleteAccountSchema = z
  .strictObject({
    confirm: z.literal(true).openapi({ description: 'The learner confirmed in the app.' }),
    appleAuthorizationCode: z.string().min(1).max(4096).optional().openapi({
      description:
        "From a fresh Sign in with Apple, for an account that signs in with Apple. It's used once, to revoke the app's access with Apple."
    }),
    appleRedirectUri: z.url().max(2048).optional().openapi({
      description:
        "The website only: the return URL its Sign in with Apple popup named, which Apple needs again to take the code. It must be on one of the website's origins. Without it, the website's code is taken as one Apple sent to GET /v1/auth/callback/apple."
    })
  })
  .openapi('DeleteAccount')

export const ProfileConflictSchema = z
  .object({ error: errorObject(['version_conflict']), current: ProfileSchema })
  .openapi('ProfileConflict', {
    description: 'The profile changed since `baseVersion`. `current` is the profile as it is now.'
  })

const nameLike = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/

const syncBaseVersionSchema = z.int().min(0).openapi({
  description:
    "The version of the entity the change was made to, or 0 for one the client has never seen. If the entity has changed since, what happens is the operation's rule, in `x-sync-entities`, which also says which operations read it."
})

const MutationSchema = z
  .object({
    id: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,64}$/)
      .openapi({
        description:
          'A client-made ID, unique for each mutation, such as a UUID. Sending the same mutation again under its ID never applies it twice, and gets the same outcome: applied at the same version, a conflict with the entity as it is then, or a rejection with the same `error.code`. Reusing an ID for a different mutation is rejected with `mutation_id_reused`.'
      }),
    entity: z
      .string()
      .regex(nameLike)
      .openapi({
        description: `${syncedEntityNames.map(name => `\`${name}\``).join(', ')}. Any other is rejected with \`unknown_entity\`, and the rest of the request still applies. A change the app's scopes don't allow is rejected with \`not_allowed\`, and the app reads only the entities its scopes do.`
      }),
    operation: z.string().regex(nameLike).openapi({
      description:
        "One of the entity's operations, in `x-sync-entities`, with the scopes each needs, the fields it takes, and whether it reads `baseVersion`. Any other is rejected with `unknown_operation`."
    }),
    entityId: z
      .string()
      .regex(/^[^\p{Cc}\p{Cf}\s]{1,200}$/u)
      .optional()
      .openapi({
        pattern: '^[^\\p{Cc}\\p{Cf}\\s]{1,200}$',
        description: entityIdsText
      }),
    baseVersion: syncBaseVersionSchema.optional(),
    fields: z
      .record(z.string().max(64), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional()
      .openapi({
        description:
          "What the operation sets: the operation's fields, in `x-sync-entities`. Each value is a string, number, boolean, or null."
      })
  })
  .openapi('Mutation', {
    description:
      'One change made on the device. `x-sync-entities` holds each entity and its operations, and `x-sync-rejections` each code a rejected result can carry.',
    'x-sync-entities': syncEntitiesExtension,
    'x-sync-rejections': rejectionMeanings
  })

export const SyncRequestSchema = z
  .object({
    cursor: z.string().min(1).max(200).nullable().optional().openapi({
      description:
        'The `cursor` from the last answer whose changes the client applied. Leave it out, or send null, to start from the beginning.'
    }),
    limit: z
      .int()
      .min(1)
      .max(syncLimits.changes.most)
      .optional()
      .openapi({
        description: `The most journal entries to read this time. Default ${syncLimits.changes.standard}.`
      }),
    mutations: z
      .array(MutationSchema)
      .max(syncLimits.mutations)
      .optional()
      .refine(
        mutations =>
          new Set(mutations?.map(mutation => mutation.id)).size === (mutations?.length ?? 0),
        {
          message: 'Each mutation in a request needs its own id.'
        }
      )
      .openapi({
        description: `Up to ${syncLimits.mutations} changes made on the device, applied in order before the changes are read.`
      })
  })
  .openapi('SyncRequest')

const KnownWordSchema = z
  .object({ itemId: z.string(), headword: z.string(), reading: z.string(), known: z.boolean() })
  .openapi('KnownWord')

const WordListSchema = z
  .object({ id: z.string(), name: z.string(), position: z.int(), createdAt: z.iso.datetime() })
  .openapi('WordList')

const ListWordSchema = z
  .object({
    listId: z.string(),
    itemId: z.string(),
    headword: z.string(),
    reading: z.string(),
    addedAt: z.iso.datetime()
  })
  .openapi('ListWord')

const WatchedVideoSchema = z
  .object({
    videoId: z.string(),
    title: z
      .string()
      .nullable()
      .openapi({
        description: `At most ${watchLimits.textLength} characters: a longer one is cut, and control characters become spaces.`
      }),
    author: z.string().nullable().openapi({ description: 'The channel, held as title is.' }),
    duration: z.number().nullable().openapi({ description: 'Seconds.' }),
    position: z.number().nullable().openapi({ description: 'Seconds: where the learner was.' }),
    comprehension: z
      .number()
      .nullable()
      .openapi({ description: "The share of the captions' words the learner knows, 0 to 1." }),
    watchedAt: z.iso.datetime().openapi({
      description:
        "When the learner last watched it, as the app said; a time after the service's is taken as the service's."
    })
  })
  .openapi('WatchedVideo')

const BookmarkSchema = z
  .object({
    id: z.string(),
    text: z.string().openapi({
      description: `The sentence as it was said, at most ${bookmarkLimits.textLength} characters: a longer one is cut, and control characters become spaces.`
    }),
    translation: z
      .string()
      .nullable()
      .openapi({
        description: `Its translation, at most ${bookmarkLimits.translationLength} characters, or null.`
      }),
    language: z
      .enum(['ja', 'en'])
      .openapi({ description: 'The language the sentence was said in.' }),
    bookmarkedAt: z.iso.datetime().openapi({
      description:
        "When the learner bookmarked it, as the app said; a time after the service's is taken as the service's."
    })
  })
  .openapi('BookmarkedSentence')

const put = <E extends string, D extends z.ZodType>(entity: E, data: D) =>
  z.object({
    entity: z.literal(entity),
    entityId: z.string(),
    operation: z.literal('put'),
    version: z.int(),
    data
  })

const ChangeSchema = z
  .union([
    put('profile', ProfileSchema),
    put('knownWord', KnownWordSchema),
    put('list', WordListSchema),
    put('listWord', ListWordSchema),
    put('watchedVideo', WatchedVideoSchema),
    put('bookmarkedSentence', BookmarkSchema),
    z.object({
      entity: z.enum(['knownWord', 'list', 'listWord', 'watchedVideo', 'bookmarkedSentence']),
      entityId: z.string(),
      operation: z.literal('delete'),
      version: z.int(),
      data: z.null()
    })
  ])
  .openapi('Change', {
    description:
      'An entity as it is now (`put`, with `data`), or gone (`delete`): a deleted list, a word removed from a list, a video removed or past the newest the account keeps, a bookmark removed, or one never there. A cleared known word is a `put` with `known: false`.'
  })

const resultBase = { id: z.string() }

const MutationResultSchema = z
  .discriminatedUnion('status', [
    z.object({ ...resultBase, status: z.literal('applied'), version: z.int() }),
    z.object({
      ...resultBase,
      status: z.literal('conflict'),
      version: z.int(),
      current: ChangeSchema
    }),
    z.object({
      ...resultBase,
      status: z.literal('rejected'),
      error: errorObject(Object.keys(rejectionMeanings))
    })
  ])
  .openapi('MutationResult', {
    description:
      '`applied`: the change is in, at `version`. `conflict`: the entity changed since `baseVersion`, so nothing changed; `current` is it as it is now. `rejected`: the change can never apply as sent; `error.code` says why. A result is final: to try again, send a new mutation with a new ID.'
  })

export const SyncAnswerSchema = z
  .object({
    results: z.array(MutationResultSchema).openapi({ description: 'One per mutation, in order.' }),
    changes: z.array(ChangeSchema).openapi({
      description:
        'The entities that changed after the cursor, each once, as they are now, including the ones this request changed. On a page, lists come before their words, but a word can come on an earlier page than its list: hold it until the sync reaches `hasMore: false`.'
    }),
    cursor: z.string().openapi({
      description:
        'Opaque, and at most 200 characters. Keep it once the changes are applied, and send it next time.'
    }),
    hasMore: z
      .boolean()
      .openapi({ description: 'More changes are waiting: sync again with the new cursor.' })
  })
  .openapi('SyncAnswer')
