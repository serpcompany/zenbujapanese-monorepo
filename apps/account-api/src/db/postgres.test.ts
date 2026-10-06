import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { readConfig } from '../config'
import { migratePostgres, openPostgres } from './postgres'

const { migrations } = readConfig({ DATABASE_URL: 'postgres://localhost/account' })
const realPostgres = process.env.ACCOUNT_API_TEST_DATABASE_URL ?? ''
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

describe('Postgres, through the driver the service runs', () => {
  test('applies the migrations, and again with nothing left to do', async () => {
    await migratePostgres(url, migrations)
    await migratePostgres(url, migrations)
  })

  test.skipIf(realPostgres === '')(
    'takes the migrations from two starts at once, one after the other',
    async () => {
      await Promise.all([migratePostgres(url, migrations), migratePostgres(url, migrations)])
    }
  )

  test('answers while the pool is open, and not after it closes', async () => {
    const database = openPostgres(url)
    expect(await database.ready()).toBe(true)
    await database.close()
    expect(await database.ready()).toBe(false)
  })
})
