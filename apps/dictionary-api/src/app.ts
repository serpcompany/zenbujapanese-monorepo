import { timingSafeEqual } from 'node:crypto'
import {
  dictionaryContract,
  dictionaryContractHeader
} from '@zenbu/dictionary-core/artifact/contract'
import { maximumEntSeq, maximumQueryLength } from '@zenbu/dictionary-core/artifact/dictionary'
import { isKanaScript, type KanaScript } from '@zenbu/dictionary-core/browse/kana'
import { maximumBrowsePage } from '@zenbu/dictionary-core/browse/lists'
import { examplesPerPage } from '@zenbu/dictionary-core/detail/examples'
import { type Context, Hono } from 'hono'
import { routePath } from 'hono/route'
import { type AppAccess, AppError, appErrorAnswer, appPaths, appRoutes } from './app-routes'
import { errorFields, log } from './log'
import type { DictionaryService } from './service'

const maximumSitemapWordsPerRequest = 10_000

class BadRequest extends Error {}
class NotFound extends Error {}

function tokenMatches(header: string | undefined, token: string): boolean {
  const presented = Buffer.from(header?.replace(/^Bearer /, '') ?? '')
  const expected = Buffer.from(token)
  return presented.length === expected.length && timingSafeEqual(presented, expected)
}

function integer(value: string | undefined, name: string, fallback: number, maximum: number) {
  if (value === undefined || value === '') return fallback
  if (!/^\d+$/.test(value)) throw new BadRequest(`${name} must be a whole number`)
  const number = Number(value)
  if (number > maximum) throw new BadRequest(`${name} must be at most ${maximum}`)
  return number
}

function text(value: string, name: string): string {
  if (value === '' || Array.from(value).length > maximumQueryLength) {
    throw new BadRequest(`${name} must be 1 to ${maximumQueryLength} characters`)
  }
  return value
}

export interface AppOptions {
  service: DictionaryService
  token: string
  ready(): boolean
  access?: AppAccess | null
}

export function createApp({ service, token, ready, access = null }: AppOptions) {
  const app = new Hono()

  app.use(async (context, next) => {
    const started = performance.now()
    await next()
    log('info', 'request', {
      method: context.req.method,
      route: routePath(context),
      status: context.res.status,
      ms: Math.round(performance.now() - started)
    })
  })

  app.get('/healthz', async context => {
    if (!ready()) return context.json({ status: 'starting' }, 503)
    const info = await service.info()
    return context.json({
      status: 'ok',
      build: info.build,
      contract: dictionaryContract,
      features: info.features
    })
  })

  app.use('/v1/*', async (context, next) => {
    if (context.req.path.startsWith(`${appPaths}/`)) return next()
    if (!tokenMatches(context.req.header('authorization'), token)) {
      return context.json({ error: 'unauthorized' }, 401)
    }
    if (!ready()) return context.json({ error: 'starting' }, 503)
    await next()
    const info = await service.info()
    context.header('X-Dictionary-Build', info.build)
    context.header(dictionaryContractHeader, String(dictionaryContract))
  })

  app.get('/v1/info', async context => context.json(await service.info()))

  app.get('/v1/search/:query', async context =>
    context.json(await service.search(text(context.req.param('query'), 'query')))
  )

  app.get('/v1/search/:query/examples', async context => {
    const found = await service.searchExamples(
      text(context.req.param('query'), 'query'),
      integer(context.req.query('from'), 'from', 0, 99)
    )
    return found ? context.json(found) : context.json({ error: 'no examples' }, 404)
  })

  const entSeq = (value: string) => {
    if (!/^\d+$/.test(value)) throw new BadRequest('entry number must be a whole number')
    const number = Number(value)
    if (number === 0 || number > maximumEntSeq) throw new NotFound('no such word')
    return number
  }

  app.get('/v1/words/:entSeq', async context => {
    const word = await service.word(entSeq(context.req.param('entSeq')))
    return word ? context.json(word) : context.json({ error: 'no such word' }, 404)
  })

  app.get('/v1/words/:entSeq/examples', async context => {
    const examples = await service.wordExamples(
      entSeq(context.req.param('entSeq')),
      integer(context.req.query('from'), 'from', 0, 99)
    )
    return examples ? context.json(examples) : context.json({ error: 'no such word' }, 404)
  })

  app.get('/v1/conjugations/:form/examples', async context =>
    context.json(
      await service.formExamples(
        text(context.req.param('form'), 'form'),
        integer(context.req.query('from'), 'from', 0, 99),
        integer(context.req.query('limit'), 'limit', examplesPerPage, 100)
      )
    )
  )

  app.get('/v1/kanji/:character', async context => {
    const character = context.req.param('character')
    if (Array.from(character).length !== 1) throw new NotFound('no such kanji')
    const kanji = await service.kanji(character)
    return kanji ? context.json(kanji) : context.json({ error: 'no such kanji' }, 404)
  })

  app.get('/v1/sitemaps/words', async context => context.json(await service.wordSitemaps()))

  app.get('/v1/sitemaps/words/:number', async context => {
    const words = await service.sitemapWords(
      integer(context.req.param('number'), 'sitemap', 0, 1_000),
      integer(context.req.query('after'), 'after', 0, 99_999_999),
      integer(
        context.req.query('limit'),
        'limit',
        maximumSitemapWordsPerRequest,
        maximumSitemapWordsPerRequest
      )
    )
    return words ? context.json(words) : context.json({ error: 'no such sitemap' }, 404)
  })

  app.get('/v1/retired', async context => context.json(await service.retired()))

  const found = <T>(context: Context, answer: T | null, what: string) =>
    answer ? context.json(answer) : context.json({ error: `no such ${what}` }, 404)
  const page = (context: Context) =>
    integer(context.req.query('page'), 'page', 1, maximumBrowsePage)
  const script = (value: string): KanaScript => {
    if (!isKanaScript(value)) throw new NotFound('no such script')
    return value
  }

  app.get('/v1/browse', async context => context.json(await service.browseSummary()))

  app.get('/v1/browse/kana/:script', async context =>
    context.json(await service.kanaIndex(script(context.req.param('script'))))
  )

  app.get('/v1/browse/kana/:script/:initial', async context =>
    found(
      context,
      await service.kanaInitial(
        script(context.req.param('script')),
        text(context.req.param('initial'), 'kana')
      ),
      'kana'
    )
  )

  app.get('/v1/browse/kana/:script/:initial/:prefix', async context => {
    const prefix = text(context.req.param('prefix'), 'kana')
    if (!prefix.startsWith(context.req.param('initial'))) throw new NotFound('no such kana')
    return found(
      context,
      await service.kanaWords(script(context.req.param('script')), prefix, page(context)),
      'kana'
    )
  })

  app.get('/v1/browse/categories', async context => context.json(await service.browseCategories()))

  app.get('/v1/browse/categories/:slug', async context =>
    found(
      context,
      await service.categoryWords(context.req.param('slug'), page(context)),
      'category'
    )
  )

  app.get('/v1/browse/ranked', async context => context.json(await service.rankedLists()))

  app.get('/v1/browse/ranked/:slug', async context =>
    found(context, await service.rankedWords(context.req.param('slug'), page(context)), 'list')
  )

  app.get('/v1/browse/kanji', async context => context.json(await service.kanjiHub()))

  app.get('/v1/browse/kanji/:slug', async context =>
    found(context, await service.kanjiList(context.req.param('slug')), 'kanji list')
  )

  app.get('/v1/sitemaps/browse', async context => context.json(await service.browseSitemap()))

  appRoutes(app, { service, ready, access })

  app.notFound(context => context.json({ error: 'not found' }, 404))

  app.onError((error, context) => {
    if (error instanceof AppError) return appErrorAnswer(context, error)
    if (error instanceof BadRequest) return context.json({ error: error.message }, 400)
    if (error instanceof NotFound) return context.json({ error: error.message }, 404)
    log('error', 'request failed', { route: routePath(context), ...errorFields(error) })
    return context.json({ error: 'internal error' }, 500)
  })

  return app
}
