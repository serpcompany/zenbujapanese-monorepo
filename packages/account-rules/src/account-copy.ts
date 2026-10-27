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

export interface Change {
  entity: string
  operation: string
  entityId: string
  fields?: EntityData
}

export type ChangeOutcome<F> =
  | { status: 'applied'; unread?: F }
  | { status: 'kept-as-new'; entityId: string; unread?: F }
  | { status: 'conflict'; unread?: F }
  | { status: 'rejected'; code: string; message: string; unread?: F }
  | { status: 'failed'; failure: F }

interface Kind {
  item: string | undefined
  cursor: string | null
  held: Map<string, Held>
}

const pageSize = 500
const mutationsAtOnce = 50

const wordsOf: Readonly<Record<string, string>> = { list: 'listWord', photo: 'photoWord' }
const ownerOf: Readonly<Record<string, string>> = { listWord: 'list', photoWord: 'photo' }

const ok = <F>(): Answered<void, F> => ({ ok: true, value: undefined })
const failed = <F>(failure: F): ChangeOutcome<F> => ({ status: 'failed', failure })
const freshKind = (item: string | undefined): Kind => ({ item, cursor: null, held: new Map() })

function resultFor(mutation: Mutation, results: readonly MutationResult[]): MutationResult {
  const result = results.find(each => each.id === mutation.id)
  if (!result) throw new Error('the account answered no result for a change it was sent')
  return result
}

function outcomeOf<F>(result: MutationResult): ChangeOutcome<F> {
  if (result.status === 'rejected') return { status: 'rejected', ...result.error }
  return result.status === 'applied' ? { status: 'applied' } : { status: 'conflict' }
}

const searchedAfterARemoval = (
  change: Change,
  result: MutationResult
): result is Extract<MutationResult, { status: 'conflict' }> =>
  change.entity === 'recentSearch' &&
  change.operation === 'search' &&
  result.status === 'conflict' &&
  result.current.data === null

const queryOf = (kind: Kind): KindQuery => ({
  limit: pageSize,
  ...(kind.cursor ? { cursor: kind.cursor } : {}),
  ...(kind.item ? { item: kind.item } : {})
})

export class AccountCopy<F> {
  private readonly kinds = new Map<string, Kind>()
  private readonly keptNotes = new Map<string, string>()
  private turn: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly transport: AccountTransport<F>,
    private readonly newId: () => string
  ) {}

  async read(entity: string, item?: string): Promise<Answered<void, F>> {
    const kind = freshKind(item)
    const read = await this.readInto(entity, kind)
    if (read.ok) this.kinds.set(entity, kind)
    return read
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

  change(
    entity: string,
    operation: string,
    entityId: string,
    fields?: EntityData,
    base?: Held | null
  ): Promise<ChangeOutcome<F>> {
    return this.inTurn(async () => {
      const from = base === undefined ? this.heldOne(entity, entityId) : base
      const change = { entity, operation, entityId, fields }
      const sent = await this.send(change, from?.version ?? 0)
      if (!sent.ok) return failed(sent.failure)
      const result = sent.value
      if (
        entity === 'wordNote' &&
        operation === 'write' &&
        fields &&
        result.status === 'conflict'
      ) {
        return this.keepTheNote(entityId, fields, from?.data ?? null, result.current)
      }
      if (searchedAfterARemoval(change, result)) {
        const again = await this.send(change, result.version)
        if (!again.ok) return failed(again.failure)
        return this.afterReading(entity, outcomeOf<F>(again.value))
      }
      return this.afterReading(entity, outcomeOf<F>(result))
    })
  }

  changeAll(changes: readonly Change[]): Promise<ChangeOutcome<F>[]> {
    return this.inTurn(async () => {
      const outcomes: ChangeOutcome<F>[] = []
      for (let at = 0; at < changes.length; at += mutationsAtOnce) {
        const mutations = changes
          .slice(at, at + mutationsAtOnce)
          .map(change => this.mutationOf(change, this.version(change.entity, change.entityId)))
        const answer = await this.transport.sync(mutations)
        if (!answer.ok) {
          outcomes.push(...changes.slice(at).map(() => failed(answer.failure)))
          break
        }
        outcomes.push(...mutations.map(mutation => outcomeOf<F>(resultFor(mutation, answer.value))))
      }
      let unread: F | undefined
      for (const entity of new Set(changes.map(change => change.entity))) {
        const read = await this.catchUp(entity)
        if (!read.ok) unread = read.failure
      }
      return outcomes.map(outcome =>
        unread === undefined || outcome.status === 'failed' ? outcome : { ...outcome, unread }
      )
    })
  }

  private inTurn<T>(work: () => Promise<T>): Promise<T> {
    const next = this.turn.then(work, work)
    this.turn = next.catch(() => undefined)
    return next
  }

  private async afterReading(entity: string, outcome: ChangeOutcome<F>) {
    const read = await this.catchUp(entity)
    return read.ok || outcome.status === 'failed' ? outcome : { ...outcome, unread: read.failure }
  }

  private async keepTheNote(
    entityId: string,
    fields: EntityData,
    startedFrom: EntityData | null,
    current: SyncedChange
  ): Promise<ChangeOutcome<F>> {
    const theirs = current.data
    if (theirs === null || theirs.text === fields.text) {
      return this.afterReading('wordNote', { status: 'conflict' })
    }
    const movedOnly = theirs.text === startedFrom?.text
    const keptAs = `${entityId}\u0000${current.version}\u0000${String(fields.text)}`
    const written = movedOnly ? entityId : (this.keptNotes.get(keptAs) ?? this.newId())
    if (!movedOnly) this.keptNotes.set(keptAs, written)
    const mine = {
      item: theirs.itemId,
      text: fields.text,
      headword: theirs.headword,
      reading: theirs.reading
    }
    const change = { entity: 'wordNote', operation: 'write', entityId: written, fields: mine }
    const sent = await this.send(change, movedOnly ? current.version : 0)
    if (!sent.ok) return failed(sent.failure)
    const outcome: ChangeOutcome<F> =
      sent.value.status !== 'applied'
        ? outcomeOf(sent.value)
        : movedOnly
          ? { status: 'applied' }
          : { status: 'kept-as-new', entityId: written }
    return this.afterReading('wordNote', outcome)
  }

  private mutationOf(change: Change, baseVersion: number): Mutation {
    const { entity, operation, entityId, fields } = change
    return {
      id: this.newId(),
      entity,
      operation,
      entityId,
      baseVersion,
      ...(fields ? { fields } : {})
    }
  }

  private async send(change: Change, baseVersion: number): Promise<Answered<MutationResult, F>> {
    const mutation = this.mutationOf(change, baseVersion)
    const answer = await this.transport.sync([mutation])
    if (!answer.ok) return answer
    return { ok: true, value: resultFor(mutation, answer.value) }
  }

  private async catchUp(entity: string): Promise<Answered<void, F>> {
    for (const related of [ownerOf[entity], entity, wordsOf[entity]]) {
      const kind = related === undefined ? undefined : this.kinds.get(related)
      if (!related || !kind) continue
      const read = await this.readForward(related, kind)
      if (!read.ok) return read
    }
    return ok()
  }

  private async readForward(entity: string, kind: Kind): Promise<Answered<void, F>> {
    const read = await this.readInto(entity, kind)
    if (read.ok || !this.transport.isStaleCursor(read.failure)) return read
    const fresh = freshKind(kind.item)
    const again = await this.readInto(entity, fresh)
    if (again.ok) this.kinds.set(entity, fresh)
    return again
  }

  private async readInto(entity: string, kind: Kind): Promise<Answered<void, F>> {
    for (;;) {
      const answer = await this.transport.readKind(entity, queryOf(kind))
      if (!answer.ok) return answer
      for (const change of answer.value.changes) this.take(kind, change)
      kind.cursor = answer.value.cursor
      if (!answer.value.hasMore) return ok()
    }
  }

  private take(kind: Kind, change: SyncedChange) {
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
