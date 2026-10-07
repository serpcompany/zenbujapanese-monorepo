import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, test } from 'vitest'

const site = fileURLToPath(new URL('../..', import.meta.url))
const folders: string[] = []

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

function deployedCopy() {
  const folder = mkdtempSync(join(tmpdir(), 'web-deploy-'))
  folders.push(folder)
  copyFileSync(join(site, 'wrangler.jsonc'), join(folder, 'wrangler.jsonc'))
  const pnpm = join(folder, 'pnpm')
  writeFileSync(pnpm, '#!/usr/bin/env bash\necho \'[{"name":"DICTIONARY_API_TOKEN"}]\'\n')
  chmodSync(pnpm, 0o755)
  const pointAt = (environment: string, service: string) =>
    execFileSync('bash', [join(site, 'scripts/use-dictionary-service.sh'), environment, service], {
      cwd: folder,
      env: { ...process.env, PATH: `${folder}:${process.env.PATH}` },
      stdio: 'pipe'
    })
  const vars = (environment: string) =>
    JSON.parse(readFileSync(join(folder, 'wrangler.jsonc'), 'utf8')).env[environment].vars
  return { pointAt, vars }
}

test("Web deploy points each environment's Worker at its own dictionary service", () => {
  const deployed = deployedCopy()
  deployed.pointAt('staging', 'https://dictionary-staging.example.com')
  expect(deployed.vars('staging').DICTIONARY_API_URL).toBe('https://dictionary-staging.example.com')
  expect(deployed.vars('production').DICTIONARY_API_URL).toBe('DICTIONARY_API_URL')
  deployed.pointAt('production', 'https://dictionary.example.com')
  expect(deployed.vars('production').DICTIONARY_API_URL).toBe('https://dictionary.example.com')
  expect(deployed.vars('production').ACCOUNT_API_URL).toBe('')
  const refused = (() => {
    try {
      deployed.pointAt('production', 'https://again.example.com')
      return ''
    } catch (error) {
      return String((error as { stdout?: Buffer }).stdout)
    }
  })()
  expect(refused).toContain('no DICTIONARY_API_URL placeholder for production')
})
