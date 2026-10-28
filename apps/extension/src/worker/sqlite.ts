import sqlite3InitModule, {
  type BindingSpec,
  type Database,
  type PreparedStatement
} from '@sqlite.org/sqlite-wasm'
import type { ArtifactDatabase, SqlValue } from '@zenbu/dictionary-core/artifact/database'

const poolName = 'zenbu-language-data'

const poolCapacity = 16

export async function openPool() {
  const sqlite3 = await sqlite3InitModule()
  const pool = await sqlite3.installOpfsSAHPoolVfs({
    name: poolName,
    initialCapacity: poolCapacity
  })
  await pool.reserveMinimumCapacity(poolCapacity)
  return pool
}

export type Pool = Awaited<ReturnType<typeof openPool>>

const shortened = (sql: string) => sql.replace(/\s+/g, ' ').slice(0, 200)

export function poolArtifact(database: Database): ArtifactDatabase & { close(): void } {
  const statements = new Map<string, PreparedStatement>()
  return {
    all<Row>(sql: string, params: readonly SqlValue[] = []): Row[] {
      let statement = statements.get(sql)
      if (!statement) {
        statement = database.prepare(sql)
        statements.set(sql, statement)
      }
      try {
        if (params.length > 0) statement.bind(params as BindingSpec)
        const rows: Row[] = []
        while (statement.step()) rows.push(statement.get({}) as Row)
        return rows
      } catch (error) {
        throw new Error(`${error instanceof Error ? error.message : error} in ${shortened(sql)}`)
      } finally {
        statement.reset(true)
      }
    },
    close() {
      for (const statement of statements.values()) statement.finalize()
      statements.clear()
      database.close()
    }
  }
}

export function attachedPath(name: string) {
  return `file:${name}?vfs=${poolName}&mode=ro`
}
