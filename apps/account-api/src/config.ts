import { fileURLToPath } from 'node:url'

export interface Config {
  port: number
  databaseUrl: string
  migrations: string
  release: string
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL ?? ''
  if (!/^postgres(ql)?:\/\/./.test(databaseUrl)) {
    throw new Error(
      'DATABASE_URL must be set to the Postgres database the service owns (postgres://user:password@host/database)'
    )
  }
  const port = Number(env.PORT ?? 8789)
  if (!Number.isInteger(port) || port <= 0) throw new Error(`PORT is ${env.PORT}`)
  return {
    port,
    databaseUrl,
    migrations: fileURLToPath(new URL('../migrations', import.meta.url)),
    release: env.ACCOUNT_API_RELEASE ?? 'local'
  }
}
