import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterAll, expect, test } from 'vitest'
import { root } from './files'
import { findSecrets } from './secrets'

mkdirSync(join(root, 'tmp'), { recursive: true })
const folder = mkdtempSync(join(root, 'tmp', 'secrets-'))
afterAll(() => rmSync(folder, { recursive: true, force: true }))

function file(name: string, content: string | Buffer): string {
  writeFileSync(join(folder, name), content)
  return relative(root, join(folder, name))
}

const githubToken = `ghp_${'0123456789abcdefABCDEF'.repeat(2).slice(0, 36)}`

test('finds a GitHub token and names its file and line, masked', async () => {
  const path = file('config.ts', `const name = 'site'\nconst token = '${githubToken}'\n`)
  const report = await findSecrets([path])
  expect(report[0]).toBe(path)
  expect(report.join('\n')).toMatch(/2:\d+\s+error\s+\[GITHUB_TOKEN\]/)
  expect(report.join('\n')).not.toContain(githubToken)
})

test('passes a file with no credential', async () => {
  expect(
    await findSecrets([file('clean.ts', "export const site = 'zenbujapanese.com'\n")])
  ).toEqual([])
})

test('skips a binary file', async () => {
  const binary = Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(githubToken)])
  expect(await findSecrets([file('data.bin', binary)])).toEqual([])
})
