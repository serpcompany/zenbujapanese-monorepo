import { describe, expect, it } from 'vitest'
import { startUnlessRunning } from './hand-over'

function pageScript(page: EventTarget, alive: { now: boolean }) {
  const script = { started: 0, stopped: 0 }
  const handle = startUnlessRunning(
    page,
    () => alive.now,
    () => {
      script.started += 1
      return {
        stop: () => {
          script.stopped += 1
        }
      }
    }
  )
  return { script, handle }
}

describe('starting the page script once per page', () => {
  it('starts once while a live copy of it already runs on the page', () => {
    const page = new EventTarget()
    const first = pageScript(page, { now: true })
    const second = pageScript(page, { now: true })
    expect(first.script).toEqual({ started: 1, stopped: 0 })
    expect(second.script).toEqual({ started: 0, stopped: 0 })
  })

  it('takes over from the copy a reloaded or updated extension left behind', () => {
    const page = new EventTarget()
    const before = { now: true }
    const left = pageScript(page, before)
    before.now = false
    const next = pageScript(page, { now: true })
    expect(left.script).toEqual({ started: 1, stopped: 1 })
    expect(next.script).toEqual({ started: 1, stopped: 0 })
    pageScript(page, { now: true })
    expect(left.script.stopped).toBe(1)
  })

  it('starts again after it was stopped', () => {
    const page = new EventTarget()
    const first = pageScript(page, { now: true })
    first.handle?.stop()
    const again = pageScript(page, { now: true })
    expect(first.script).toEqual({ started: 1, stopped: 1 })
    expect(again.script).toEqual({ started: 1, stopped: 0 })
  })
})
