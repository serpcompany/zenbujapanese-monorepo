import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import pg from 'pg'
import { afterAll, beforeAll } from 'vitest'
import { migrationsFolder as migrations } from '../config'
import { migratePostgres, openPostgres } from '../db/postgres'

export const realPostgres = process.env.ACCOUNT_API_TEST_DATABASE_URL ?? ''

export function usePostgres() {
  let url = realPostgres
  let stop = async () => {}

  beforeAll(async () => {
    if (url !== '') return
    const db = await PGlite.create()
    const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, maxConnections: 10 })
    await server.start()
    url = `postgres://postgres@${server.getServerConn()}/postgres`
    stop = async () => {
      await server.stop()
      await db.close()
    }
  })

  afterAll(() => stop())

  return {
    url: () => url,
    async anAccount(prefix: string) {
      await migratePostgres(url, migrations)
      const database = openPostgres(url)
      const raw = new pg.Client({ connectionString: url })
      await raw.connect()
      const made: string[] = []
      const user = async (name: string) => {
        const id = `${name}-${randomUUID()}`
        await raw.query('insert into users (id, name, email) values ($1, $2, $3)', [
          id,
          '',
          `${id}@example.com`
        ])
        made.push(id)
        return id
      }
      const id = await user(prefix)
      const done = async () => {
        await raw.query('delete from users where id = any($1)', [made])
        await raw.end()
        await database.close()
      }
      return { database, raw, id, user, done }
    }
  }
}
