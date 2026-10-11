import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const perFileChecks = ['comments', 'sizes', 'layers', 'secrets']

const sessionName = /^[A-Za-z0-9_-]{1,128}$/

export function toldFile(checkout: string, session: string | undefined): string | undefined {
  if (!session || !sessionName.test(session)) return undefined
  return join(checkout, 'tmp', 'agent', 'stop-hook', `${session}.txt`)
}

export function alreadyTold(file: string | undefined, report: string): boolean {
  if (!file) return false
  const key = createHash('sha256').update(report).digest('hex')
  if (existsSync(file) && readFileSync(file, 'utf8') === key) return true
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, key)
  return false
}
