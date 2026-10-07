import { availableParallelism } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const serviceDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

interface AppsConfig {
  accountUrl: string
  jwksUrl: string
  requestsPerMinute: number
}

export interface Config {
  port: number
  token: string
  resources: string
  languageDataRelease: string
  sudachiDictionary: string | null
  workers: number
  release: string
  apps: AppsConfig | null
}

function webUrl(name: string, value: string): string {
  const url = URL.canParse(value) ? new URL(value) : null
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new Error(`${name} must be an http or https URL, not ${value}`)
  }
  return value
}

function readApps(env: NodeJS.ProcessEnv): AppsConfig | null {
  const accountUrl = env.ACCOUNT_API_URL?.replace(/\/+$/, '') ?? ''
  if (accountUrl === '') return null
  const requestsPerMinute = Number(env.APP_REQUESTS_PER_MINUTE || 60)
  if (!Number.isInteger(requestsPerMinute) || requestsPerMinute < 1) {
    throw new Error(`APP_REQUESTS_PER_MINUTE is ${env.APP_REQUESTS_PER_MINUTE}`)
  }
  return {
    accountUrl: webUrl('ACCOUNT_API_URL', accountUrl),
    jwksUrl: webUrl('ACCOUNT_JWKS_URL', env.ACCOUNT_JWKS_URL || `${accountUrl}/v1/auth/jwks`),
    requestsPerMinute
  }
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const token = env.DICTIONARY_API_TOKEN ?? ''
  if (token.length < 16) {
    throw new Error(
      'DICTIONARY_API_TOKEN must be set to a secret of at least 16 characters; the website sends it'
    )
  }
  const port = Number(env.PORT ?? 8788)
  if (!Number.isInteger(port) || port <= 0) throw new Error(`PORT is ${env.PORT}`)
  const workers = Number(env.DICTIONARY_API_WORKERS ?? Math.min(availableParallelism(), 4))
  if (!Number.isInteger(workers) || workers < 1) {
    throw new Error(`DICTIONARY_API_WORKERS is ${env.DICTIONARY_API_WORKERS}`)
  }
  const sudachi = env.SUDACHI_DICTIONARY ?? join(serviceDir, '.sudachi/system_core.dic')
  return {
    port,
    token,
    resources: resolve(
      env.DICTIONARY_RESOURCES ??
        join(serviceDir, '../ios/Modules/Sources/SearchExperience/Resources')
    ),
    languageDataRelease: resolve(
      env.LANGUAGE_DATA_RELEASE_FILE ?? join(serviceDir, '../../language-data/release.json')
    ),
    sudachiDictionary: env.SUDACHI_DICTIONARY === '' ? null : resolve(sudachi),
    workers,
    release: env.DICTIONARY_API_RELEASE ?? 'local',
    apps: readApps(env)
  }
}
