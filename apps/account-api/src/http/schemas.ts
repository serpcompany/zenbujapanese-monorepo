import { z } from '@hono/zod-openapi'
import { profileLimits } from '../domain/profile'
import { syncLimits } from '../domain/sync'

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
        'The profile revision. It goes up with each change, by one, or by a million when the service starts on a restored backup; send it back as `baseVersion` to change the profile.'
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

export const ProfileConflictSchema = ErrorSchema.extend({ current: ProfileSchema }).openapi(
  'ProfileConflict',
  { description: 'The profile changed since `baseVersion`. `current` is the profile as it is now.' }
)

const nameLike = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/

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
      .openapi({ description: 'The entity type. Only `profile` today; any other is rejected.' }),
    operation: z.string().regex(nameLike).openapi({ description: 'For `profile`, only `update`.' }),
    entityId: z
      .string()
      .regex(/^[\x21-\x7e]{1,200}$/)
      .optional()
      .openapi({ description: "For `profile`, the account's ID, or left out." }),
    baseVersion: baseVersionSchema.optional(),
    fields: z
      .record(z.string().max(64), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional()
      .openapi({
        description:
          'For a `profile` update, `name`, `username`, or both, as in PATCH /v1/me. Each value is a string, number, boolean, or null.'
      })
  })
  .openapi('Mutation')

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

const resultBase = { id: z.string() }

const MutationResultSchema = z
  .discriminatedUnion('status', [
    z.object({ ...resultBase, status: z.literal('applied'), version: z.int() }),
    z.object({
      ...resultBase,
      status: z.literal('conflict'),
      version: z.int(),
      current: ProfileSchema
    }),
    z.object({ ...resultBase, status: z.literal('rejected'), error: ErrorSchema.shape.error })
  ])
  .openapi('MutationResult', {
    description:
      '`applied`: the change is in, at `version`. `conflict`: the entity changed since `baseVersion`, so nothing changed; `current` is it as it is now. `rejected`: the change can never apply as sent; `error.code` says why. A result is final: to try again, send a new mutation with a new ID.'
  })

const ChangeSchema = z
  .object({
    entity: z.literal('profile'),
    entityId: z.string(),
    operation: z.literal('put').openapi({ description: 'The entity as it is now is in `data`.' }),
    version: z.int(),
    data: ProfileSchema
  })
  .openapi('Change')

export const SyncAnswerSchema = z
  .object({
    results: z.array(MutationResultSchema).openapi({ description: 'One per mutation, in order.' }),
    changes: z.array(ChangeSchema).openapi({
      description:
        'The entities that changed after the cursor, each once, as they are now, including the ones this request changed.'
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
