import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import type { Accounts } from '../domain/accounts'
import { kindsAboutItems } from '../domain/kind-reads'
import type { EntityType } from '../domain/store'
import { syncLimits } from '../domain/sync'
import { changeJson } from './accounts'
import type { AccountEnv } from './env'
import { errorBody } from './errors'
import { requestsPerMinute } from './rate-limit'
import { json, refusal } from './refusals'
import { failed, needs, refuse, tooMany, unauthorized } from './route-answers'
import { ChangeSchema } from './schemas'
import { subscriptionRequired } from './subscription-schemas'
import { syncedEntityNames } from './sync-entities'

const itemKinds = kindsAboutItems.map(kind => `\`${kind}\``).join(', ')

const KindSchema = z.enum(syncedEntityNames as [EntityType, ...EntityType[]]).openapi({
  param: { name: 'entity', in: 'path' },
  description: 'The kind, as `x-sync-entities` names it.'
})

const KindQuerySchema = z.object({
  cursor: z.string().min(1).max(200).optional().openapi({
    description:
      "The `cursor` the last read of this kind answered, to read what changed since. Leave it out to read every one. A sync's cursor isn't one, nor another kind's."
  }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(syncLimits.changes.most)
    .optional()
    .openapi({
      description: `The most entities to answer this time. Default ${syncLimits.changes.standard}.`
    }),
  item: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .openapi({
      description: `Only those about one word or kanji: a Language Reference ID, \`kanji:\` and the kanji, or, for a note, the \`wn1:\` note identity it was saved under. For ${itemKinds} only.`
    })
})

const KindAnswerSchema = z
  .object({
    changes: z.array(ChangeSchema).openapi({
      description:
        'Each entity of the kind, once, as it is now, in the order the account last changed them, oldest first: a `put`, or a `delete` for one removed, as sync answers them.'
    }),
    cursor: z.string().openapi({
      description:
        'Opaque, and at most 200 characters. Send it to read the rest, or, later, what changed since.'
    }),
    hasMore: z
      .boolean()
      .openapi({ description: 'More are waiting: read again with the new cursor.' })
  })
  .openapi('KindAnswer')

const notAboutItems = `\`item\` is only for ${itemKinds}, and must be in the form the kind's entity ID names it.`

const readKind = createRoute({
  method: 'get',
  path: '/v1/sync/{entity}',
  summary: "The account's entities of one kind, as they are now",
  description:
    "Reads what sync would answer of one kind alone, for a client that keeps no copy of its own, such as the website: every list, say, or every list word of one word. Changes go through POST /v1/sync, as every app's do. It needs the kind's read scope (`x-sync-entities`), and counts against sync's limit.",
  security: needs(),
  request: { params: z.object({ entity: KindSchema }), query: KindQuerySchema },
  responses: {
    200: json(KindAnswerSchema, 'The entities.'),
    400: refusal({
      bad_request: `The kind isn't one the service syncs, or the query is out of bounds. ${notAboutItems}`
    }),
    401: unauthorized,
    402: refusal(subscriptionRequired),
    403: refusal({
      insufficient_scope: "This app's access to the account doesn't include the kind's read scope."
    }),
    410: refusal({
      invalid_cursor:
        "The cursor isn't one this service gave this account for this kind, or the account has since forgotten a deletion past it. Read again with no cursor."
    }),
    429: tooMany(requestsPerMinute.sync),
    500: failed
  }
})

export function kindReadRoutes(app: OpenAPIHono<AccountEnv>, accounts: Accounts) {
  app.openapi(readKind, async context => {
    const { entity } = context.req.valid('param')
    const answer = await accounts.readKind(
      context.get('userId'),
      entity,
      context.req.valid('query'),
      context.get('scopes')
    )
    if (answer.status === 'no_account') return refuse(context)
    if (answer.status === 'not_readable') {
      return context.json(
        errorBody(
          'insufficient_scope',
          `This app's access to the account doesn't include ${answer.scope}.`
        ),
        403,
        { 'WWW-Authenticate': `Bearer error="insufficient_scope", scope="${answer.scope}"` }
      )
    }
    if (answer.status === 'not_about_items' || answer.status === 'bad_item') {
      return context.json(errorBody('bad_request', notAboutItems), 400)
    }
    if (answer.status === 'invalid_cursor') {
      return context.json(errorBody('invalid_cursor', 'Read again with no cursor.'), 410)
    }
    return context.json(
      {
        changes: answer.changes.map(changeJson),
        cursor: answer.cursor,
        hasMore: answer.hasMore
      },
      200
    )
  })
}
