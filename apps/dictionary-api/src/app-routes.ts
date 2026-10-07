import { wordCardFormat } from '@zenbu/dictionary-core/cards/card'
import { segmentationFormat } from '@zenbu/dictionary-core/cards/segmentation'
import { isLanguageReferenceId } from '@zenbu/dictionary-core/cards/word-list'
import type { Context, Hono } from 'hono'
import type { RateLimit } from './rate-limit'
import {
  AccountKeysUnavailable,
  type AccountTokens,
  type DictionaryService,
  type ServiceInfo
} from './service'

export const appPaths = '/v1/apps'

export const maximumCardsPerRequest = 100

export const maximumSegmentedLength = 200

const dictionaryScope = 'dictionary:read'

const cachedFor = 24 * 60 * 60

export interface AppAccess {
  tokens: AccountTokens
  limit: RateLimit
}

export class AppError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 429 | 503,
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export const appErrorAnswer = (context: Context, error: AppError) =>
  context.json({ error: { code: error.code, message: error.message } }, error.status)

const bearer = (header: string | undefined) => header?.match(/^Bearer (\S+)$/)?.[1] ?? null

function cached(context: Context, info: ServiceInfo, answer: object) {
  const tag = `"${info.build}"`
  context.header('Cache-Control', `private, max-age=${cachedFor}`)
  context.header('ETag', tag)
  if (context.req.header('if-none-match') === tag) return context.body(null, 304)
  return context.json({ ...answer, languageData: info.languageData })
}

export function appRoutes(
  app: Hono,
  {
    service,
    ready,
    access
  }: { service: DictionaryService; ready(): boolean; access: AppAccess | null }
) {
  app.use(`${appPaths}/*`, async (context, next) => {
    if (!access) {
      throw new AppError(503, 'unavailable', 'This service checks no account tokens yet')
    }
    const token = bearer(context.req.header('authorization'))
    let caller: Awaited<ReturnType<AccountTokens>> = null
    try {
      caller = token ? await access.tokens(token) : null
    } catch (error) {
      if (error instanceof AccountKeysUnavailable) {
        throw new AppError(503, 'unavailable', "The account service's keys couldn't be read")
      }
      throw error
    }
    if (!caller) {
      context.header('WWW-Authenticate', 'Bearer')
      throw new AppError(401, 'unauthorized', 'Send a valid Zenbu account access token')
    }
    if (!caller.scopes.has(dictionaryScope)) {
      throw new AppError(403, 'insufficient_scope', `The token has no ${dictionaryScope} scope`)
    }
    const wait = access.limit(caller.account)
    if (wait !== null) {
      context.header('Retry-After', String(wait))
      throw new AppError(429, 'rate_limited', `Too many requests; try again in ${wait} seconds`)
    }
    if (!ready()) throw new AppError(503, 'starting', 'The dictionary is starting')
    await next()
  })

  app.get(`${appPaths}/word-cards`, async context => {
    const ids = (context.req.query('ids') ?? '').split(',').filter(Boolean)
    if (ids.length === 0 || ids.length > maximumCardsPerRequest) {
      throw new AppError(400, 'bad_request', `ids must name 1 to ${maximumCardsPerRequest} words`)
    }
    const named = ids.map(id => id.toLowerCase())
    if (!named.every(isLanguageReferenceId)) {
      throw new AppError(400, 'bad_request', 'Each id must be a Language Reference ID')
    }
    const [info, cards] = await Promise.all([service.info(), service.wordCards(named)])
    const found = new Set(cards.map(card => card.languageReferenceID))
    return cached(context, info, {
      format: wordCardFormat,
      cards,
      missing: [...new Set(named)].filter(id => !found.has(id))
    })
  })

  app.get(`${appPaths}/segmentation`, async context => {
    const text = context.req.query('text') ?? ''
    if (text.trim() === '' || Array.from(text).length > maximumSegmentedLength) {
      throw new AppError(
        400,
        'bad_request',
        `text must be 1 to ${maximumSegmentedLength} characters`
      )
    }
    const [info, tokens] = await Promise.all([service.info(), service.segment(text)])
    return cached(context, info, { format: segmentationFormat, text, tokens })
  })
}
