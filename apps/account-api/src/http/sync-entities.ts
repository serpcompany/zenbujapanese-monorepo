import { bookmarkLimits } from '../domain/bookmarks'
import { photoLimits } from '../domain/photo-files'
import type { RejectionCode } from '../domain/profile'
import type { EntityType } from '../domain/store'
import { syncedEntities } from '../domain/sync'
import { listLimits } from '../domain/word-lists'
import { noteLimits } from '../domain/word-notes'
import { type EntityRule, studyRules } from './sync-entity-rules'
import { count, studyFieldSchemas } from './sync-fields'
import { keptFieldSchemas } from './sync-kept-fields'
import { keptRules } from './sync-kept-rules'

export const syncFieldSchemas = [...studyFieldSchemas, ...keptFieldSchemas]

export const syncEntityRules: Readonly<Record<EntityType, EntityRule>> = {
  ...studyRules,
  ...keptRules
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
  too_many_bookmarks: `The account has ${count(bookmarkLimits.bookmarks)} bookmarked sentences.`,
  too_many_notes: `The account has ${count(noteLimits.notes)} notes.`,
  unknown_photo: "The photo word's photo isn't in the account, or was deleted.",
  photo_not_uploaded:
    'The account holds no file for that photo: upload it with `PUT /v1/photos/{photoId}`, then send the change again under a new ID.',
  photo_full: `The photo is on ${photoLimits.wordsPerPhoto} words.`,
  unknown_setting:
    'The service syncs no setting of that name, as when it is older than the app. Keep the setting on the device, and send it again once the service knows it.',
  not_allowed: "The app's scopes don't include the operation's."
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })

const exampleIds = new Map(
  (Object.entries(syncEntityRules) as [EntityType, EntityRule][])
    .flatMap(([entity, rule]) => Object.keys(rule.operations).map(name => `${entity}.${name}`))
    .map((key, index) => [
      key,
      `6f1c0e7a-3b5d-4c2e-9a8f-${(index + 1).toString(16).padStart(12, '0')}`
    ])
)

function operations(entity: EntityType, rules: EntityRule['operations']) {
  return Object.fromEntries(
    Object.entries(rules).map(([name, rule]) => [
      name,
      {
        scopes: [...(syncedEntities[entity].operations[name]?.needs ?? [])],
        baseVersion: rule.baseVersion,
        description: rule.rule,
        ...(rule.fields ? { fields: ref(rule.fields) } : {}),
        example: {
          id: exampleIds.get(`${entity}.${name}`),
          entity,
          operation: name,
          ...rule.example
        }
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
