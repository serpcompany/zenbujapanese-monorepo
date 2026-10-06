import { describe, expect, test } from 'vitest'
import { readConfig } from './config'

const databaseUrl = 'postgres://localhost:5432/account'

describe('readConfig', () => {
  test('needs a Postgres URL, and never repeats it in the error', () => {
    for (const DATABASE_URL of [undefined, '', 'mysql://localhost/account', 'postgres://']) {
      expect(() => readConfig({ DATABASE_URL })).toThrow(/^DATABASE_URL must be set/)
    }
    expect(() => readConfig({ DATABASE_URL: 'https://secret-password@x' })).not.toThrow(
      /secret-password/
    )
  })

  test('defaults the port and release, and finds the migrations beside the code', () => {
    const config = readConfig({ DATABASE_URL: databaseUrl })
    expect(config).toMatchObject({ port: 8789, databaseUrl, release: 'local' })
    expect(config.migrations).toMatch(/apps\/account-api\/migrations$/)
  })

  test('refuses a port that is not a positive whole number', () => {
    expect(() => readConfig({ DATABASE_URL: databaseUrl, PORT: 'eighty' })).toThrow('PORT')
  })
})
