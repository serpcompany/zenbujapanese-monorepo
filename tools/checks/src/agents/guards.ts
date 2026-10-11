import { expect } from 'vitest'
import type { StepRun } from './workflow'

type Fields = Record<string, unknown>
export type ResultEntry = (overrides?: Fields) => Fields
export type GuardRun = (log: unknown) => Promise<StepRun>

export function claudeResult(defaults: Fields): ResultEntry {
  return (overrides = {}) => ({
    type: 'result',
    subtype: 'success',
    is_error: false,
    permission_denials: [],
    ...defaults,
    ...overrides
  })
}

export function minutesAfter(start: string, minutes: number): string {
  return new Date(Date.parse(start) + minutes * 60_000).toISOString()
}

export function deniedCommand(command: string): Fields {
  return { permission_denials: [{ tool_name: 'Bash', tool_input: { command } }] }
}

export function executionLog(log: unknown): {
  env: { EXECUTION_FILE: string }
  files: Record<string, string>
} {
  if (log === undefined) return { env: { EXECUTION_FILE: '' }, files: {} }
  return { env: { EXECUTION_FILE: 'log.json' }, files: { 'log.json': JSON.stringify(log) } }
}

const subagentStillRunning = {
  type: 'system',
  subtype: 'background_tasks_changed',
  tasks: [{ task_id: 'a1', task_type: 'local_agent', description: 'Check the rules' }]
}

const tokenRefused = {
  is_error: true,
  subtype: 'success',
  num_turns: 1,
  total_cost_usd: 0,
  modelUsage: {},
  api_error_status: 401,
  result:
    'Failed to authenticate: OAuth token revoked. Please log in again or contact your administrator.'
}

export async function expectFailureUnlessClaudeFinished(
  run: GuardRun,
  result: ResultEntry
): Promise<void> {
  expect((await run(undefined)).status).not.toBe(0)
  expect((await run([{ type: 'system', subtype: 'init' }])).status).not.toBe(0)
  expect((await run([result({ is_error: true, subtype: 'error_max_turns' })])).status).not.toBe(0)
  const refused = await run([result(tokenRefused)])
  expect(refused.status).not.toBe(0)
  expect(refused.output).toContain('OAuth token revoked')
  expect(refused.output).toContain('renew the CLAUDE_CODE_OAUTH_TOKEN secret')
  const stopped = await run([subagentStillRunning, result()])
  expect(stopped.status).not.toBe(0)
  expect(stopped.output).toContain('background task')
}
