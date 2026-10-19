import { describe, expect, test } from 'vitest'
import { markRenderIncomplete, watchedRender } from './render-health'

describe('a render’s health', () => {
  test('a render that marks a part missing, after awaiting, is incomplete', async () => {
    const watched = watchedRender(async () => {
      await Promise.resolve()
      await new Promise(resolve => setTimeout(resolve, 1))
      markRenderIncomplete()
      return 'page'
    })
    expect(await watched.result).toBe('page')
    expect(watched.incomplete()).toBe(true)
  })

  test('a render that marks nothing is whole, and another render’s mark doesn’t reach it', async () => {
    const whole = watchedRender(async () => 'page')
    const broken = watchedRender(async () => markRenderIncomplete())
    await Promise.all([whole.result, broken.result])
    expect(whole.incomplete()).toBe(false)
    expect(broken.incomplete()).toBe(true)
  })

  test('a mark outside any watched render does nothing', () => {
    expect(() => markRenderIncomplete()).not.toThrow()
  })
})
