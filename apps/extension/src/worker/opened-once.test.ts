import { describe, expect, it, vi } from 'vitest'
import { openedOnce } from './opened-once'

describe('openedOnce', () => {
  it('opens once and shares what it opened', async () => {
    const open = vi.fn(async () => ({ name: 'pool' }))
    const pool = openedOnce(open)
    const [first, second] = await Promise.all([pool(), pool()])
    expect(first).toBe(second)
    expect(await pool()).toBe(first)
    expect(open).toHaveBeenCalledOnce()
  })

  it('opens again after a failure, instead of keeping the failure', async () => {
    const open = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('The pool’s handles are held.'))
      .mockResolvedValueOnce('pool')
    const pool = openedOnce(open)
    await expect(pool()).rejects.toThrow('The pool’s handles are held.')
    expect(await pool()).toBe('pool')
    expect(open).toHaveBeenCalledTimes(2)
  })
})
