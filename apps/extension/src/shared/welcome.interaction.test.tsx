import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataState } from './data-state'
import type { ReadData } from './dictionary-progress'
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

const ready: DataState = { state: 'ready', release: '2026.10.1', bytes: 237_000_000, checkedAt: 1 }

function worker(states: DataState[]) {
  const asked: string[] = []
  const answer = (type: string) => async () => {
    asked.push(type)
    const data = states.length > 1 ? (states.shift() as DataState) : states[0]
    return { type: 'state' as const, data }
  }
  return { read: vi.fn<ReadData>(answer('state')), check: vi.fn<ReadData>(answer('update')), asked }
}

async function render({ read, check }: { read: ReadData; check?: ReadData }) {
  const container = document.body.appendChild(document.createElement('div'))
  await act(async () => {
    root = createRoot(container)
    root.render(<Welcome read={read} check={check} />)
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
    const page = await render(
      worker([
        { state: 'downloading', done: 0, total: 237_000_000 },
        { state: 'downloading', done: 118_500_000, total: 237_000_000 },
        ready
      ])
    )
    expect(page.text()).toContain(labels.welcome.title)
    expect(page.text()).toContain(labels.progress.downloading)
    expect(page.progress()).toBe('0')
    expect(page.text()).toContain('0% · 0 of 237 MB')
    await poll()
    expect(page.progress()).toBe('50')
    expect(page.text()).toContain('50% · 119 of 237 MB')
    await poll()
    expect(page.state()).toBe('ready')
    expect(page.text()).toContain(labels.progress.ready)
    expect(page.progress()).toBeUndefined()
  })

  it('stops asking once the dictionary is ready', async () => {
    const { read } = worker([ready])
    await render({ read })
    await poll()
    await poll()
    expect(read).toHaveBeenCalledOnce()
  })

  it('keeps saying the dictionary is ready while it checks for and downloads an update', async () => {
    const page = await render(
      worker([
        { ...ready, state: 'updating', done: 0, total: 0 },
        { ...ready, state: 'updating', done: 5_000_000, total: 10_000_000 },
        { ...ready, updateFailed: 'Failed to fetch' }
      ])
    )
    expect(page.text()).toContain(labels.progress.ready)
    expect(page.text()).toContain(labels.progress.checkingForUpdates)
    expect(page.progress()).toBeUndefined()
    await poll()
    expect(page.text()).toContain(labels.progress.updating)
    expect(page.progress()).toBe('50')
    await poll()
    expect(page.text()).toContain(`${labels.progress.updateFailed} Failed to fetch`)
  })

  it('shows the three first steps, with no subscription step', async () => {
    const page = await render(worker([{ state: 'checking' }]))
    for (const step of labels.welcome.steps) expect(page.text()).toContain(step)
    expect(labels.welcome.steps).toHaveLength(3)
    expect(page.text().toLowerCase()).not.toContain('subscription')
  })

  it('says why a download failed, and Try again starts it again', async () => {
    const reason = 'JLPTLevelPack.sqlite3 part 1 is 00, but compressed.json pins ff'
    const fake = worker([
      { state: 'failed', reason },
      { state: 'downloading', done: 10_000_000, total: 237_000_000 }
    ])
    const page = await render(fake)
    expect(page.state()).toBe('failed')
    expect(page.text()).toContain(labels.progress.failed)
    expect(page.text()).toContain(reason)
    await act(async () => page.tryAgain()?.click())
    expect(fake.asked).toEqual(['state', 'update'])
    expect(page.state()).toBe('downloading')
    expect(page.tryAgain()).toBeUndefined()
  })

  it('says the dictionary is not answering when the worker fails to answer', async () => {
    const read = vi.fn<ReadData>(async () => ({
      type: 'failed',
      reason: 'The dictionary worker did not answer.'
    }))
    const page = await render({ read })
    expect(page.state()).toBe('failed')
    expect(page.text()).toContain('The dictionary worker did not answer.')
  })
})
