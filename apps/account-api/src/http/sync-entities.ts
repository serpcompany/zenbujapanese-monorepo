import { z } from '@hono/zod-openapi'
import { itemTextLength } from '../domain/entities'
import { profileLimits, type RejectionCode } from '../domain/profile'
import type { EntityType } from '../domain/store'
import { syncedEntities } from '../domain/sync'
import { listLimits } from '../domain/word-lists'

interface OperationRule {
  baseVersion: boolean
  rule: string
  fields?: string
  example: { entityId?: string; baseVersion?: number; fields?: Record<string, unknown> }
}

interface EntityRule {
  rule: string
  entityId: string
  data: string
  operations: Readonly<Record<string, OperationRule>>
}

const { min, max } = profileLimits.usernameLength
const count = (value: number) => value.toLocaleString('en-US')

const ItemFields = z.object({
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

export const syncFieldSchemas: readonly (readonly [string, z.ZodType])[] = [
  ['ProfileUpdateFields', ProfileFields],
  ['WordFields', ItemFields],
  ['ListCreateFields', ListFields],
  ['ListUpdateFields', ListUpdateFields]
]

const listId = '3b7f2c9e-5d1a-4e8b-9c6f-0a2d4e6f8b1c'
const itemId = '9d2e4f6a8b0c1d3e5f7a9b1c3d5e7f90'
const word = { headword: '見る', reading: 'みる' }

export const syncEntityRules: Readonly<Record<EntityType, EntityRule>> = {
  profile: {
    rule: "The account's name and username. `PATCH /v1/me` changes them by the same rule; the email doesn't change here.",
    entityId: "The account's ID, or left out.",
    data: 'Profile',
    operations: {
      update: {
        baseVersion: true,
        rule: "Name, username, or both. It applies only at the profile's current version, or conflicts with the profile as it is now; sending the current values again is applied and changes nothing.",
        fields: 'ProfileUpdateFields',
        example: { baseVersion: 1, fields: { name: 'Kana Fan', username: 'kana_fan' } }
      }
    }
  },
  knownWord: {
    rule: 'Whether the learner knows a word or a kanji. A cleared word stays, as a `put` with `known: false`.',
    entityId:
      'The item: a Language Reference ID (32 lowercase hex digits), or `kanji:` and one kanji, kept in Unicode NFC.',
    data: 'KnownWord',
    operations: {
      mark: {
        baseVersion: true,
        rule: 'It applies only if the word is still at `baseVersion` (0 for one the account never had), so a mark made before the learner cleared the word loses to the clear, and one made after seeing it wins. Marking a known word is applied and changes nothing.',
        fields: 'WordFields',
        example: { entityId: itemId, baseVersion: 0, fields: word }
      },
      clear: {
        baseVersion: true,
        rule: "It applies only at the word's current version: a clear that never saw a later mark conflicts, and the word stays known. Clearing a word not known is applied and changes nothing.",
        example: { entityId: itemId, baseVersion: 1 }
      }
    }
  },
  list: {
    rule: `A word list. An account holds at most ${count(listLimits.lists)}, and a deleted list's ID can't be used again.`,
    entityId: 'Its UUID, in either case; answers name it in lowercase.',
    data: 'WordList',
    operations: {
      create: {
        baseVersion: false,
        rule: `Rejected \`already_exists\` if the account has or had a list with that ID, and \`too_many_lists\` past ${count(listLimits.lists)}.`,
        fields: 'ListCreateFields',
        example: { entityId: listId, fields: { name: 'Food', position: 0 } }
      },
      update: {
        baseVersion: true,
        rule: 'A rename, a move, or both. It applies only at the current version, so two renames conflict and the second gets the list as it is now; one that already matches the list is applied. An update of a deleted list conflicts with the `delete`.',
        fields: 'ListUpdateFields',
        example: { entityId: listId, baseVersion: 1, fields: { name: 'Food and drink' } }
      },
      delete: {
        baseVersion: false,
        rule: "It always applies, wins over everything done to the list since, renames and words added elsewhere too, and takes the list's words with it: drop them on the device.",
        example: { entityId: listId }
      }
    }
  },
  listWord: {
    rule: `A word in a list. A list holds at most ${count(listLimits.wordsPerList)}.`,
    entityId: "The list's UUID, a slash, and the item: `<list>/<item>`.",
    data: 'ListWord',
    operations: {
      add: {
        baseVersion: false,
        rule: `It always applies to a list the account has. To a deleted or unknown list it's rejected \`unknown_list\`, and past ${count(listLimits.wordsPerList)} words \`list_full\`. Adding a word the list has is applied and changes nothing.`,
        fields: 'WordFields',
        example: { entityId: `${listId}/${itemId}`, fields: word }
      },
      remove: {
        baseVersion: true,
        rule: "It applies only at the word's current version, so it removes only an add it saw: an add the remover never saw wins, and the remove conflicts. Removing a word the list hasn't is applied.",
        example: { entityId: `${listId}/${itemId}`, baseVersion: 1 }
      }
    }
  }
}

export const rejectionMeanings: Readonly<Record<RejectionCode, string>> = {
  invalid_fields: "A field is missing, isn't one the operation takes, or is out of bounds.",
  username_taken: 'Another account has that username.',
  unknown_entity:
    'The service syncs no such entity, as when it is older than the app. Keep the change, and send the entity again once the service knows it.',
  unknown_operation: 'The entity has no such operation.',
  invalid_mutation:
    "`entityId` isn't in the entity's form, or `baseVersion` is missing from an operation that reads it.",
  mutation_id_reused: 'The ID was used for a different mutation. Give each mutation its own.',
  already_exists: 'The account has, or had, a list with that ID.',
  unknown_list: "The list word's list isn't in the account, or was deleted.",
  too_many_lists: `The account has ${count(listLimits.lists)} lists.`,
  list_full: `The list has ${count(listLimits.wordsPerList)} words.`,
  not_allowed: "The app's scopes don't include the operation's."
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })

const exampleId = '6f1c0e7a-3b5d-4c2e-9a8f-1d2e3f4a5b6c'

function operations(entity: EntityType, rules: EntityRule['operations']) {
  return Object.fromEntries(
    Object.entries(rules).map(([name, rule]) => [
      name,
      {
        scopes: [...(syncedEntities[entity].operations[name]?.needs ?? [])],
        baseVersion: rule.baseVersion,
        description: rule.rule,
        ...(rule.fields ? { fields: ref(rule.fields) } : {}),
        example: { id: exampleId, entity, operation: name, ...rule.example }
      }
    ])
  )
}

export const syncEntitiesExtension = Object.fromEntries(
  (Object.entries(syncEntityRules) as [EntityType, EntityRule][]).map(([entity, rule]) => [
    entity,
    {
      description: rule.rule,
      entityId: rule.entityId,
      read: syncedEntities[entity].reads,
      data: ref(rule.data),
      operations: operations(entity, rule.operations)
    }
  ])
)

export const syncedEntityNames = Object.keys(syncEntityRules)

export const entityIdsText = (Object.entries(syncEntityRules) as [EntityType, EntityRule][])
  .map(([entity, rule]) => `- \`${entity}\`: ${rule.entityId}`)
  .join('\n')
