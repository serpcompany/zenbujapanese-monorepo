import { afterEach, describe, expect, test, vi } from 'vitest'
import { errorFields, log } from './log'

afterEach(() => vi.restoreAllMocks())

describe('log', () => {
  test('writes one JSON line, errors to stderr and the rest to stdout', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    log('info', 'listening', { port: 8789 })
    log('error', 'failed to start')
    const [line] = stdout.mock.calls[0]
    expect(JSON.parse(String(line))).toMatchObject({
      level: 'info',
      message: 'listening',
      port: 8789
    })
    expect(String(line).endsWith('\n')).toBe(true)
    expect(JSON.parse(String(stderr.mock.calls[0][0]))).toMatchObject({ level: 'error' })
  })

  test('describes an error by its message and stack, and anything else as text', () => {
    expect(errorFields(new Error('closed'))).toMatchObject({ error: 'closed' })
    expect(errorFields(new Error('closed')).stack).toContain('closed')
    expect(errorFields(42)).toEqual({ error: '42' })
  })
})
