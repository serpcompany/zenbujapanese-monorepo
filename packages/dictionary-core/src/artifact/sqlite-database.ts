import type { ArtifactDatabase, SqlValue } from './database'

interface SqliteConnection {
  prepare(sql: string): { all(...params: SqlValue[]): unknown[] }
}

export function sqliteDatabase(connection: SqliteConnection): ArtifactDatabase {
  return {
    all<Row>(sql: string, params: readonly SqlValue[] = []): Row[] {
      return connection.prepare(sql).all(...params) as Row[]
    }
  }
}
