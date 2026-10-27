import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataState } from './data-state'
import type { AskData } from './data-status'
import { labels } from './labels'
import { Welcome } from './welcome'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
  vi.useRealTimers()
})

function worker(states: DataState[]) {
  const asked: string[] = []
  const ask = vi.fn<AskData>(async ({ type }) => {
    asked.push(type)
    const data = states.length > 1 ? (states.shift() as DataState) : states[0]
    return { type: 'state', data }
  })
  return { ask, asked }
}

async function render(ask: AskData) {
  const container = document.body.appendChild(document.createElement('div'))
  await act(async () => {
    root = createRoot(container)
    root.render(<Welcome ask={ask} />)
  })
  return {
    text: () => container.textContent ?? '',
    state: () =>
      container.querySelector('[data-welcome-state]')?.getAttribute('data-welcome-state'),
    progress: () => container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),
    tryAgain: () =>
      [...container.querySelectorAll('button')].find(
        button => button.textContent === labels.welcome.tryAgain
      )
  }
}

const poll = () => act(async () => vi.advanceTimersByTimeAsync(1000))

describe('the welcome tab', () => {
  it('shows the download rising with its percent and megabytes, then says the dictionary is ready', async () => {
    const { ask } = worker([
      { state: 'downloading', done: 0, total: 237_000_000 },
      { state: 'downloading', done: 118_500_000, total: 237_000_000 },
      { state: 'ready', release: '2026.10.1' }
    ])
    const page = await render(ask)
    expect(page.text()).toContain(labels.welcome.title)
    expect(page.text()).toContain(labels.welcome.downloading)
    expect(page.progress()).toBe('0')
    expect(page.text()).toContain('0% · 0 of 237 MB')
    await poll()
    expect(page.progress()).toBe('50')
    expect(page.text()).toContain('50% · 119 of 237 MB')
    await poll()
    expect(page.state()).toBe('ready')
    expect(page.text()).toContain(labels.welcome.ready)
    expect(page.progress()).toBeUndefined()
  })

  it('stops asking once the dictionary is ready', async () => {
    const { ask } = worker([{ state: 'ready', release: '2026.10.1' }])
    await render(ask)
    await poll()
    await poll()
    expect(ask).toHaveBeenCalledOnce()
  })

  it('shows the three first steps, with no subscription step', async () => {
    const page = await render(worker([{ state: 'checking' }]).ask)
    for (const step of labels.welcome.steps) expect(page.text()).toContain(step)
    expect(labels.welcome.steps).toHaveLength(3)
    expect(page.text().toLowerCase()).not.toContain('subscription')
  })

  it('says why a download failed, and Try Again starts it again', async () => {
    const reason = 'JLPTLevelPack.sqlite3 part 1 is 00, but compressed.json pins ff'
    const { ask, asked } = worker([
      { state: 'failed', reason },
      { state: 'downloading', done: 10_000_000, total: 237_000_000 }
    ])
    const page = await render(ask)
    expect(page.state()).toBe('failed')
    expect(page.text()).toContain(labels.welcome.failed)
    expect(page.text()).toContain(reason)
    await act(async () => page.tryAgain()?.click())
    expect(asked).toEqual(['state', 'update'])
    expect(page.state()).toBe('downloading')
    expect(page.tryAgain()).toBeUndefined()
  })

  it('says the dictionary is not answering when the worker fails to answer', async () => {
    const ask = vi.fn<AskData>(async () => ({
      type: 'failed',
      reason: 'The dictionary worker did not answer.'
    }))
    const page = await render(ask)
    expect(page.state()).toBe('failed')
    expect(page.text()).toContain('The dictionary worker did not answer.')
  })
})
