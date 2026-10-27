type Data = Record<string, unknown>

interface Entity {
  version: number
  data: Data | null
  sequence: number
}

interface Mutation {
  id: string
  entity: string
  operation: string
  entityId: string
  baseVersion?: number
  fields?: Data
}

type Result =
  | { id: string; status: 'applied'; version: number }
  | { id: string; status: 'conflict'; version: number; current: Data }
  | { id: string; status: 'rejected'; error: { code: string; message: string } }

export interface Answered {
  status: number
  body: unknown
}

const ownerOf: Record<string, string> = { listWord: 'list', photoWord: 'photo' }
const wordsOf: Record<string, string> = { list: 'listWord', photo: 'photoWord' }
const removals = new Set(['clear', 'delete', 'remove'])
const pageSize = 100

function stateAfter(operation: string, data: Data | null, fields: Data) {
  const was = data?.state ?? (data?.known === true ? 'known' : 'unknown')
  if (operation === 'set') return fields.state
  if (operation === 'mark') return 'known'
  return was === 'known' ? 'unknown' : was
}

const refused = (status: number, code: string): Answered => ({
  status,
  body: { error: { code, message: code } }
})

export class SyncedStandIn {
  private readonly kinds = new Map<string, Map<string, Entity>>()
  private sequence = 0
  private refusals: string[] = []
  private failedReads: number[] = []
  private pages: Map<string, string> | null = null
  readonly sent: Mutation[] = []
  readonly reads: string[] = []
  readonly pagesAsked: string[] = []
  readonly syncsAsked: { mutations?: Mutation[] }[] = []
  subscribed = true
  added = '2026-10-01T00:00:00.000Z'
  readonly searchKey = 'ab'.repeat(32)

  private kind(entity: string) {
    const found = this.kinds.get(entity) ?? new Map<string, Entity>()
    this.kinds.set(entity, found)
    return found
  }

  holds(entity: string, entityId: string, data: Data | null, version = 1): this {
    this.kind(entity).set(entityId, { version, data, sequence: ++this.sequence })
    return this
  }

  hasPage(itemId: string, path: string): this {
    this.pages = (this.pages ?? new Map()).set(itemId, path)
    return this
  }

  private pagesOf(query: URLSearchParams): Answered {
    const pages = this.pages
    if (!pages) return { status: 502, body: { error: 'The dictionary service didn’t answer' } }
    const found = (asked: string | null, itemOf: (each: string) => string) => {
      const listed = asked ? asked.split(',') : []
      this.pagesAsked.push(...listed.map(itemOf))
      return Object.fromEntries(
        listed.flatMap(each => {
          const path = pages.get(itemOf(each))
          return path === undefined ? [] : [[each, path]]
        })
      )
    }
    return {
      status: 200,
      body: {
        words: found(query.get('words'), each => each),
        kanji: found(query.get('kanji'), each => `kanji:${each}`)
      }
    }
  }

  dataOf(entity: string, entityId: string) {
    return this.kind(entity).get(entityId)?.data ?? null
  }

  refuseNext(code: string): this {
    this.refusals.push(code)
    return this
  }

  failNextRead(status: number): this {
    this.failedReads.push(status)
    return this
  }

  private changeOf(entity: string, entityId: string, held: Entity | undefined) {
    const data = held?.data ?? null
    return {
      entity,
      entityId,
      operation: data === null ? 'delete' : 'put',
      version: held?.version ?? 0,
      data
    }
  }

  private matches(entity: string, entityId: string, held: Entity, item: string | null) {
    if (item === null) return true
    if (entity === 'knownWord') return entityId === item
    if (entity === 'wordNote') return held.data === null || held.data.itemId === item
    return entityId.endsWith(`/${item}`)
  }

  readKind(entity: string, query: URLSearchParams): Answered {
    this.reads.push(`${entity}?${query}`)
    if (!this.subscribed) return refused(402, 'subscription_required')
    const failure = this.failedReads.shift()
    if (failure) return refused(failure, 'too_many_requests')
    const after = Number(query.get('cursor') ?? '0')
    const limit = Number(query.get('limit') ?? pageSize)
    const item = query.get('item')
    const entries = [...this.kind(entity)]
      .filter(([id, held]) => held.sequence > after && this.matches(entity, id, held, item))
      .sort(([, one], [, other]) => one.sequence - other.sequence)
    const page = entries.slice(0, limit)
    return {
      status: 200,
      body: {
        changes: page.map(([id, held]) => this.changeOf(entity, id, held)),
        cursor: String(page.at(-1)?.[1].sequence ?? after),
        hasMore: entries.length > limit
      }
    }
  }

  private save(entity: string, entityId: string, data: Data | null, version: number) {
    this.kind(entity).set(entityId, { version, data, sequence: ++this.sequence })
    const words = wordsOf[entity]
    if (data !== null || !words) return
    for (const id of [...this.kind(words).keys()]) {
      if (id.startsWith(`${entityId}/`)) this.kind(words).delete(id)
    }
  }

  private dataAfter(mutation: Mutation, held: Entity | undefined): Data | null {
    const { entity, operation, entityId, fields = {} } = mutation
    if (entity === 'knownWord') {
      const state = stateAfter(operation, held?.data ?? null, fields)
      return { itemId: entityId, ...(held?.data ?? fields), state, known: state === 'known' }
    }
    if (removals.has(operation)) return null
    if (entity === 'list') return { id: entityId, createdAt: this.added, ...held?.data, ...fields }
    if (entity === 'listWord') {
      const [listId, itemId] = entityId.split('/')
      return { listId, itemId, addedAt: new Date().toISOString(), ...fields }
    }
    if (entity === 'wordNote') {
      const { item, ...rest } = fields
      return { id: entityId, itemId: item, ...rest }
    }
    if (entity === 'recentSearch') {
      const before = String(held?.data?.searchedAt ?? '')
      const searchedAt = before > String(fields.searchedAt) ? before : fields.searchedAt
      return { id: entityId, query: fields.query, searchedAt }
    }
    return { ...held?.data, ...fields }
  }

  private apply(mutation: Mutation): Result {
    const { id, entity, operation, entityId } = mutation
    const refusal = this.refusals.shift()
    if (refusal) return { id, status: 'rejected', error: { code: refusal, message: refusal } }
    const owner = ownerOf[entity]
    const ownerHeld = owner ? this.kind(owner).get(entityId.split('/')[0] ?? '') : undefined
    if (owner && operation === 'add' && !ownerHeld?.data) {
      return { id, status: 'rejected', error: { code: `unknown_${owner}`, message: 'gone' } }
    }
    const held = this.kind(entity).get(entityId)
    if (operation === 'create' && held) {
      return { id, status: 'rejected', error: { code: 'already_exists', message: 'taken' } }
    }
    const version = held?.version ?? 0
    const next = this.dataAfter(mutation, held)
    if (JSON.stringify(next) === JSON.stringify(held?.data ?? null) && entity !== 'listWord') {
      return { id, status: 'applied', version }
    }
    const searchedAgain = operation === 'search' && Boolean(held?.data)
    const alwaysApplies = operation === 'add' || operation === 'create' || searchedAgain
    const overADelete = entity === 'wordNote' && operation === 'write' && held?.data === null
    if (!alwaysApplies && !overADelete && mutation.baseVersion !== version) {
      return { id, status: 'conflict', version, current: this.changeOf(entity, entityId, held) }
    }
    if (operation === 'add' && held?.data) return { id, status: 'applied', version }
    this.save(entity, entityId, next, version + 1)
    return { id, status: 'applied', version: version + 1 }
  }

  sync(body: { mutations?: Mutation[] }): Answered {
    this.syncsAsked.push(body)
    if (!this.subscribed) return refused(402, 'subscription_required')
    const mutations = body.mutations ?? []
    this.sent.push(...mutations)
    return {
      status: 200,
      body: {
        results: mutations.map(each => this.apply(each)),
        changes: [],
        cursor: 'c',
        hasMore: false,
        searchKey: this.searchKey
      }
    }
  }

  answer(method: string, url: URL, body: unknown): Answered | null {
    if (method === 'GET' && url.pathname === '/dictionary/pages.json') {
      return this.pagesOf(url.searchParams)
    }
    if (method === 'POST' && url.pathname === '/v1/sync')
      return this.sync(body as { mutations?: Mutation[] })
    const kind = /^\/v1\/sync\/([A-Za-z]+)$/.exec(url.pathname)?.[1]
    return method === 'GET' && kind ? this.readKind(kind, url.searchParams) : null
  }
}
