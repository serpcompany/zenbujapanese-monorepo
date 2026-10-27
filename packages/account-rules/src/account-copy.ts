export type EntityData = Record<string, unknown>

export interface SyncedChange {
  entity: string
  entityId: string
  operation: string
  version: number
  data: EntityData | null
  emptied?: boolean
}

export interface Mutation {
  id: string
  entity: string
  operation: string
  entityId: string
  baseVersion: number
  fields?: EntityData
}

export type MutationResult =
  | { id: string; status: 'applied'; version: number }
  | { id: string; status: 'conflict'; version: number; current: SyncedChange }
  | { id: string; status: 'rejected'; error: { code: string; message: string } }

export interface KindPage {
  changes: SyncedChange[]
  cursor: string
  hasMore: boolean
}

export interface KindQuery {
  cursor?: string
  item?: string
  limit?: number
}

export type Answered<T, F> = { ok: true; value: T } | { ok: false; failure: F }

export interface AccountTransport<F> {
  readKind(entity: string, query: KindQuery): Promise<Answered<KindPage, F>>
  sync(mutations: Mutation[]): Promise<Answered<MutationResult[], F>>
  isStaleCursor(failure: F): boolean
}

export interface Held {
  entityId: string
  version: number
  data: EntityData | null
}

export type ChangeOutcome<F> =
  | { status: 'applied' }
  | { status: 'kept-as-new'; entityId: string }
  | { status: 'conflict' }
  | { status: 'rejected'; code: string; message: string }
  | { status: 'failed'; failure: F }

interface Kind {
  item: string | undefined
  cursor: string | null
  held: Map<string, Held>
}

const pageSize = 500

const wordsOf: Readonly<Record<string, string>> = { list: 'listWord', photo: 'photoWord' }
const ownerOf: Readonly<Record<string, string>> = { listWord: 'list', photoWord: 'photo' }

const ok = <F>(): Answered<void, F> => ({ ok: true, value: undefined })

export class AccountCopy<F> {
  private readonly kinds = new Map<string, Kind>()

  constructor(
    private readonly transport: AccountTransport<F>,
    private readonly newId: () => string
  ) {}

  async read(entity: string, item?: string): Promise<Answered<void, F>> {
    const kind: Kind = { item, cursor: null, held: new Map() }
    this.kinds.set(entity, kind)
    return this.readOn(entity, kind)
  }

  holds(entity: string): boolean {
    return this.kinds.has(entity)
  }

  held(entity: string): Held[] {
    return [...(this.kinds.get(entity)?.held.values() ?? [])]
  }

  heldOne(entity: string, entityId: string): Held | null {
    return this.kinds.get(entity)?.held.get(entityId) ?? null
  }

  version(entity: string, entityId: string): number {
    return this.heldOne(entity, entityId)?.version ?? 0
  }

  async change(
    entity: string,
    operation: string,
    entityId: string,
    fields?: EntityData
  ): Promise<ChangeOutcome<F>> {
    const startedFrom = this.heldOne(entity, entityId)?.data ?? null
    const sent = await this.send(
      entity,
      operation,
      entityId,
      this.version(entity, entityId),
      fields
    )
    if (!sent.ok) return { status: 'failed', failure: sent.failure }
    const result = sent.value
    const caughtUp = await this.catchUp(entity)
    if (!caughtUp.ok) return { status: 'failed', failure: caughtUp.failure }
    if (result.status === 'rejected') return { status: 'rejected', ...result.error }
    if (result.status === 'applied') return { status: 'applied' }
    if (entity === 'wordNote' && operation === 'write' && fields) {
      return this.keepTheNote(entityId, fields, startedFrom, result.current)
    }
    return { status: 'conflict' }
  }

  private async keepTheNote(
    entityId: string,
    fields: EntityData,
    startedFrom: EntityData | null,
    current: SyncedChange
  ): Promise<ChangeOutcome<F>> {
    const theirs = current.data
    if (theirs === null || theirs.text === fields.text) return { status: 'conflict' }
    const movedOnly = theirs.text === startedFrom?.text
    const written = movedOnly ? entityId : this.newId()
    const baseVersion = movedOnly ? current.version : 0
    const mine = {
      item: theirs.itemId,
      text: fields.text,
      headword: theirs.headword,
      reading: theirs.reading
    }
    const sent = await this.send('wordNote', 'write', written, baseVersion, mine)
    if (!sent.ok) return { status: 'failed', failure: sent.failure }
    const caughtUp = await this.catchUp('wordNote')
    if (!caughtUp.ok) return { status: 'failed', failure: caughtUp.failure }
    if (sent.value.status === 'rejected') return { status: 'rejected', ...sent.value.error }
    if (sent.value.status === 'conflict') return { status: 'conflict' }
    return movedOnly ? { status: 'applied' } : { status: 'kept-as-new', entityId: written }
  }

  private async send(
    entity: string,
    operation: string,
    entityId: string,
    baseVersion: number,
    fields: EntityData | undefined
  ): Promise<Answered<MutationResult, F>> {
    const mutation: Mutation = {
      id: this.newId(),
      entity,
      operation,
      entityId,
      baseVersion,
      ...(fields ? { fields } : {})
    }
    const answer = await this.transport.sync([mutation])
    if (!answer.ok) return answer
    const result = answer.value.find(each => each.id === mutation.id)
    if (!result) throw new Error('the account answered no result for the change it was sent')
    return { ok: true, value: result }
  }

  private async catchUp(entity: string): Promise<Answered<void, F>> {
    for (const related of [ownerOf[entity], entity, wordsOf[entity]]) {
      const kind = related === undefined ? undefined : this.kinds.get(related)
      if (!related || !kind) continue
      const read = await this.readOn(related, kind)
      if (!read.ok) return read
    }
    return ok()
  }

  private async readOn(entity: string, kind: Kind): Promise<Answered<void, F>> {
    for (;;) {
      const query: KindQuery = {
        limit: pageSize,
        ...(kind.cursor ? { cursor: kind.cursor } : {}),
        ...(kind.item ? { item: kind.item } : {})
      }
      const answer = await this.transport.readKind(entity, query)
      if (!answer.ok && kind.cursor && this.transport.isStaleCursor(answer.failure)) {
        kind.cursor = null
        kind.held.clear()
        continue
      }
      if (!answer.ok) return answer
      for (const change of answer.value.changes) this.take(change)
      kind.cursor = answer.value.cursor
      if (!answer.value.hasMore) return ok()
    }
  }

  private take(change: SyncedChange) {
    const kind = this.kinds.get(change.entity)
    if (!kind) return
    kind.held.delete(change.entityId)
    kind.held.set(change.entityId, {
      entityId: change.entityId,
      version: change.version,
      data: change.data
    })
    const words = wordsOf[change.entity]
    const wordKind = words === undefined ? undefined : this.kinds.get(words)
    if (change.data !== null || !wordKind) return
    for (const id of [...wordKind.held.keys()]) {
      if (id.startsWith(`${change.entityId}/`)) wordKind.held.delete(id)
    }
  }
}
