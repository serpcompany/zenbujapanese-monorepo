import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { segmentationFormat } from '@zenbu/dictionary-core/cards/segmentation'
import { maximumCardsPerRequest, maximumSegmentedLength } from '../app-routes'

const tiers = z
  .enum(['veryCommon', 'common', 'moderate', 'uncommon', 'rare'])
  .nullable()
  .openapi({ description: 'How common the rank makes the word, or `null` with no rank.' })

const chip = {
  source: z.string().openapi({ description: "The chip's label, such as `JLPT` or `YouTube`." }),
  value: z
    .string()
    .openapi({ description: 'What the chip shows, such as `N5`, `1,234`, or `No rank`.' }),
  tier: tiers,
  spokenTier: z
    .string()
    .nullable()
    .openapi({ description: 'The tier in words, for a screen reader, or `null`.' })
}

export const LanguageDataSchema = z
  .object({
    release: z.string().openapi({ description: 'The language-data release, such as `2026.10.1`.' }),
    files: z.record(z.string(), z.string()).openapi({
      description: 'The SHA-256 of each file a card is read from, by file name.'
    })
  })
  .openapi('LanguageData', {
    description:
      'Which language data answered. Key a cache on all of it: a field that changes means fetch again.'
  })

export const WordCardSchema = z
  .object({
    languageReferenceID: z.string().openapi({ description: 'The entry, in lowercase hex.' }),
    entSeq: z.int().openapi({ description: 'Its JMdict entry number.' }),
    headword: z.string(),
    reading: z.string(),
    furigana: z.array(
      z.object({
        base: z.string(),
        reading: z.string().optional(),
        kanjiReadings: z.array(z.string()).optional()
      })
    ),
    pitch: z
      .object({
        downstep: z.int().openapi({ description: '0 for flat.' }),
        moraCount: z.int(),
        morae: z.array(z.string()),
        levels: z.string().openapi({ description: '`H` or `L` for each of `morae`.' }),
        particle: z.enum(['H', 'L']),
        estimated: z.boolean(),
        source: z.string()
      })
      .nullable(),
    partOfSpeech: z.string(),
    meanings: z.array(
      z.object({
        meaning: z.string(),
        notes: z.array(z.string()),
        partsOfSpeech: z.array(z.string())
      })
    ),
    jlpt: z.object({ ...chip, level: z.int().min(1).max(5) }).nullable(),
    frequency: z.array(
      z.object({
        ...chip,
        list: z.string().openapi({ description: "The ranked list's slug, such as `youtube`." }),
        rank: z.int().nullable()
      })
    )
  })
  .openapi('WordCard', {
    description:
      'One word as the app shows it (`zenbu.word-cards.v1`, language-data/word-cards.md, A card).'
  })

export const WordCardSourceSchema = z
  .object({
    name: z.string(),
    supplies: z.string(),
    license: z.string(),
    url: z.string(),
    notice: z
      .string()
      .openapi({ description: "A notice's file name in the language-data release." })
  })
  .openapi('WordCardSource')

export const WordCardsAnswerSchema = z
  .object({
    format: z.literal('zenbu.word-cards.v1'),
    license: z.object({ name: z.string(), url: z.string(), statement: z.string() }).openapi({
      description: 'The license the cards are shared under, and a statement to show with them.'
    }),
    sources: z.array(WordCardSourceSchema),
    cards: z.array(WordCardSchema).openapi({
      description: 'A card for each ID with an entry, in the order asked, each once.'
    }),
    missing: z.array(z.string()).openapi({ description: 'The IDs no entry has, lowercased.' }),
    languageData: LanguageDataSchema
  })
  .openapi('WordCardsAnswer')

export const SegmentedTokenSchema = z
  .object({
    text: z.string(),
    reading: z
      .string()
      .optional()
      .openapi({ description: 'In hiragana, when the token has kanji.' }),
    dictionaryForm: z.string().optional().openapi({ description: 'When it differs from `text`.' }),
    languageReferenceID: z
      .string()
      .optional()
      .openapi({ description: 'The entry, when the token is one word.' }),
    candidates: z
      .array(z.string())
      .optional()
      .openapi({ description: 'The entries it may be, when it may be several.' })
  })
  .openapi('SegmentedToken')

export const SegmentationAnswerSchema = z
  .object({
    format: z.literal(segmentationFormat),
    text: z.string().openapi({ description: 'The text, as sent.' }),
    tokens: z.array(SegmentedTokenSchema),
    languageData: LanguageDataSchema
  })
  .openapi('SegmentationAnswer')

const refusal = (meanings: Record<string, string>) => ({
  description: Object.entries(meanings)
    .map(([code, meaning]) => `\`${code}\`: ${meaning}`)
    .join(' '),
  content: {
    'application/json': {
      schema: z.object({
        error: z.object({
          code: z.string().openapi({ enum: Object.keys(meanings) }),
          message: z.string()
        })
      })
    }
  }
})

const header = (description: string) => ({ description, schema: { type: 'string' as const } })

const cached = {
  ETag: header("The service's build, quoted. Send it back as `If-None-Match` to revalidate."),
  'Cache-Control': header('`private, max-age=86400`: keep the answer a day, then revalidate.')
}

const answers = (schema: z.ZodType, description: string, badRequest: string) => ({
  200: {
    description,
    headers: cached,
    content: { 'application/json': { schema } }
  },
  304: {
    description: '`If-None-Match` named this build: the copy the app has still holds.',
    headers: cached
  },
  400: refusal({ bad_request: badRequest }),
  401: {
    ...refusal({
      unauthorized:
        "No access token, or one that's expired, forged, or not the account service's. Get a new one from GET /v1/auth/token, and send the request once more."
    }),
    headers: { 'WWW-Authenticate': header('`Bearer`.') }
  },
  403: {
    ...refusal({
      insufficient_scope: "The app's token has no `dictionary:read`. Don't retry."
    }),
    headers: { 'WWW-Authenticate': header('Names the scope: `scope="dictionary:read"`.') }
  },
  429: {
    ...refusal({
      rate_limited:
        'This account sent more than its requests a minute (60 unless the service is set otherwise).'
    }),
    headers: { 'Retry-After': header('The seconds to wait.') }
  },
  500: refusal({ internal: 'The dictionary failed to answer. Retry with backoff.' }),
  503: refusal({
    unavailable:
      "The service can't check account tokens yet, or can't read the account service's keys. Retry with backoff.",
    starting: 'The dictionary is still loading. Retry with backoff.'
  })
})

const security = [{ accessToken: ['dictionary:read'] }]

const revalidating = z.object({
  'if-none-match': z.string().optional().openapi({
    description: 'The `ETag` of the copy the app keeps; a match answers `304`.'
  })
})

const appRouteContracts = {
  wordCards: createRoute({
    method: 'get',
    path: '/v1/apps/word-cards',
    summary: 'Word cards for the words an app asks for',
    description:
      "The cards for up to 100 Language Reference IDs, in the format an app's baked cards use, with the license and sources to show, and the IDs no entry has.",
    security,
    request: {
      query: z.object({
        ids: z.string().openapi({
          description: `1 to ${maximumCardsPerRequest} Language Reference IDs (32 hex digits, in either case), comma-separated. One asked twice is answered once.`,
          example: '7f490a9c9c0da94f4e9474f4efe74be1'
        })
      }),
      headers: revalidating
    },
    responses: answers(
      WordCardsAnswerSchema,
      'The cards.',
      `\`ids\` names no word, more than ${maximumCardsPerRequest}, or something that isn't a Language Reference ID.`
    )
  }),
  segmentation: createRoute({
    method: 'get',
    path: '/v1/apps/segmentation',
    summary: 'A text split into words, as the app links captions and example sentences',
    description:
      'Each token with its reading, its dictionary form, and the entry it is, or the entries it may be.',
    security,
    request: {
      query: z.object({
        text: z.string().openapi({
          description: `1 to ${maximumSegmentedLength} characters, not all blank, URL-encoded.`,
          example: '猫を見る'
        })
      }),
      headers: revalidating
    },
    responses: answers(
      SegmentationAnswerSchema,
      'The tokens.',
      `\`text\` is blank, or over ${maximumSegmentedLength} characters.`
    )
  })
}

export function appRoutesDocument() {
  const registry = new OpenAPIHono()
  registry.openAPIRegistry.registerComponent('securitySchemes', 'accessToken', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      "An access token from the account service's GET /v1/auth/token, on the same host, with `dictionary:read` in its `scope`: an EdDSA JWT whose `iss` and `aud` are that host. The service checks it against the account service's JWKS. Never the website's service token."
  })
  for (const route of Object.values(appRouteContracts)) registry.openAPIRegistry.registerPath(route)
  return registry.getOpenAPI31Document({
    openapi: '3.1.0',
    info: {
      title: "Zenbu dictionary service's routes for apps",
      version: '1',
      description: [
        "Word cards and segmentation for a signed-in app that doesn't bundle the language data, such as Tomodachi (ADR 0013). They're the only dictionary routes an app calls; the website's own routes take its service token and are in docs/agents/dictionary-api.md.",
        '',
        '- **Errors** are `{ "error": { "code": "...", "message": "..." } }`, a missing route\'s `404 not_found` included. Branch on `code`.',
        '- **Caching.** Each answer carries `languageData`, and is `Cache-Control: private, max-age=86400` with the build as its `ETag`. Keep it a day, then revalidate with `If-None-Match`; a `304` means it holds. Key what you keep on all of `languageData`, and fetch again when any of it changes. An error is never cached.',
        '- **Browsers.** The routes send no CORS headers: an app calls them from a device, not a web page.'
      ].join('\n')
    },
    servers: [
      { url: 'https://api.zenbujapanese.com', description: 'Production' },
      { url: 'https://api-staging.zenbujapanese.com', description: 'Staging' }
    ]
  })
}
