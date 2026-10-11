import { join } from 'node:path'
import { expect, test } from 'vitest'
import { installAdvice, routeHook } from '../route.mjs'

const here = '/work/main'
const worktree = '/work/main/.claude/worktrees/task'
const theirHook = join(worktree, 'tools', 'checks', 'hook.mjs')
const theirPackages = join(worktree, 'tools', 'checks', 'node_modules')

test('checks a file in this checkout here', () => {
  expect(routeHook(here, 'hook.mjs', here, () => false)).toEqual({ kind: 'here' })
})

test('skips a file that is in no repository', () => {
  expect(routeHook(undefined, 'hook.mjs', here, () => true)).toEqual({ kind: 'skip' })
})

test("hands a worktree's file to that worktree's own checks", () => {
  const has = (path: unknown) => path === theirHook || path === theirPackages
  expect(routeHook(worktree, 'hook.mjs', here, has)).toEqual({
    kind: 'elsewhere',
    script: theirHook
  })
})

test("asks for an install when the worktree's packages are missing", () => {
  const has = (path: unknown) => path === theirHook
  expect(routeHook(worktree, 'hook.mjs', here, has)).toEqual({
    kind: 'install',
    checkout: worktree
  })
  expect(installAdvice(worktree)).toMatch(/Run pnpm install there/)
})

test('skips a repository that has no such hook', () => {
  expect(routeHook('/work/other', 'stop-hook.mjs', here, () => false)).toEqual({ kind: 'skip' })
})
