import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { alreadyTold, changedPaths, toldFile } from '../route.mjs'

const folders: string[] = []
const scratch = () => {
  const folder = mkdtempSync(join(tmpdir(), 'zenbu-stop-'))
  folders.push(folder)
  return folder
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

test('lists each changed or new file once, in order', () => {
  expect(changedPaths('docs/b.md\0apps/a.ts\0', 'apps/a.ts\0new file.ts\0')).toEqual([
    'apps/a.ts',
    'docs/b.md',
    'new file.ts'
  ])
  expect(changedPaths('', '')).toEqual([])
})

test('tells a session about the same failures once', () => {
  const file = toldFile(scratch(), 'session-1')
  expect(alreadyTold(file, 'a broken link')).toBe(false)
  expect(alreadyTold(file, 'a broken link')).toBe(true)
  expect(alreadyTold(file, 'another broken link')).toBe(false)
})

test('keeps no record for a session it cannot name safely', () => {
  const checkout = scratch()
  expect(toldFile(checkout, undefined)).toBeUndefined()
  expect(toldFile(checkout, '../outside')).toBeUndefined()
  expect(alreadyTold(undefined, 'a broken link')).toBe(false)
  expect(existsSync(join(checkout, 'tmp'))).toBe(false)
})
