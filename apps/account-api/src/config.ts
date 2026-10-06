import { fileURLToPath } from 'node:url'
import { readPort } from '@zenbu/node-service/config'

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
  return {
    port: readPort(env.PORT, 8789),
    databaseUrl,
    migrations: fileURLToPath(new URL('../migrations', import.meta.url)),
    release: env.ACCOUNT_API_RELEASE ?? 'local'
  }
}
