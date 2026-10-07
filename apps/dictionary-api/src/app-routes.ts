import { wordCardFormat } from '@zenbu/dictionary-core/cards/card'
import { segmentationFormat } from '@zenbu/dictionary-core/cards/segmentation'
import { wordCardLicense, wordCardSources } from '@zenbu/dictionary-core/cards/sources'
import { isLanguageReferenceId } from '@zenbu/dictionary-core/cards/word-list'
import type { Context, Hono } from 'hono'
import type { RateLimit } from './rate-limit'
import {
  AccountKeysUnavailable,
  type AccountTokens,
  type DictionaryService,
  type ServiceInfo
} from './service'

const appPaths = '/v1/apps'

export const isAppPath = (path: string) => path.startsWith(`${appPaths}/`)

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
    readonly status: 400 | 401 | 403 | 404 | 429 | 500 | 503,
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export const appErrorAnswer = (context: Context, error: AppError) =>
  context.json({ error: { code: error.code, message: error.message } }, error.status)

const bearer = (header: string | undefined) => header?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null

const entityTags = (header: string) => header.split(',').map(tag => tag.trim().replace(/^W\//, ''))

async function cacheable(
  context: Context,
  service: DictionaryService,
  answer: (info: ServiceInfo) => Promise<object>
) {
  const info = await service.info()
  const tag = `"${info.build}"`
  const asked = context.req.header('if-none-match')
  const unchanged = asked !== undefined && (asked.trim() === '*' || entityTags(asked).includes(tag))
  const body = unchanged ? null : { ...(await answer(info)), languageData: info.languageData }
  context.header('Cache-Control', `private, max-age=${cachedFor}`)
  context.header('ETag', tag)
  return body ? context.json(body) : context.body(null, 304)
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
      context.header(
        'WWW-Authenticate',
        `Bearer error="insufficient_scope", scope="${dictionaryScope}"`
      )
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
    return cacheable(context, service, async () => {
      const cards = await service.wordCards(named)
      const found = new Set(cards.map(card => card.languageReferenceID))
      return {
        format: wordCardFormat,
        license: wordCardLicense,
        sources: wordCardSources,
        cards,
        missing: [...new Set(named)].filter(id => !found.has(id))
      }
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
    return cacheable(context, service, async () => ({
      format: segmentationFormat,
      text,
      tokens: await service.segment(text)
    }))
  })
}
