// The service's configuration, from the environment. docs/agents/dictionary-api.md lists it.

import { availableParallelism } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const serviceDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

export interface Config {
  port: number
  /** The bearer token every /v1 request must carry; the website holds the same secret. */
  token: string
  /** The app's SearchExperience/Resources: the artifact, packs, kanji files, and Kuromoji. */
  resources: string
  /** Sudachi's dictionary (`pnpm sudachi`); without it, sentence search is off. */
  sudachiDictionary: string | null
  /** How many worker threads answer requests. */
  workers: number
  /** A name for this build of the code, such as its commit; with the artifact, it names the build. */
  release: string
}

/** Reads the configuration, throwing on anything missing or malformed. */
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
    sudachiDictionary: env.SUDACHI_DICTIONARY === '' ? null : resolve(sudachi),
    workers,
    release: env.DICTIONARY_API_RELEASE ?? 'local'
  }
}
