import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataState } from './data-state'
import type { ReadData } from './dictionary-progress'
import { DictionaryStatus } from './dictionary-status'
import { labels } from './labels'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ready: DataState = { state: 'ready', release: '2026.10.1', bytes: 521_000_000, checkedAt: 1 }

let root: Root | undefined

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

const answering = (data: DataState) => vi.fn<ReadData>(async () => ({ type: 'state', data }))

async function render(read: ReadData, check: ReadData = read) {
  const container = document.body.appendChild(document.createElement('div'))
  await act(async () => {
    root = createRoot(container)
    root.render(<DictionaryStatus read={read} check={check} />)
  })
  return {
    status: () =>
      container.querySelector('[data-dictionary-status]')?.getAttribute('data-dictionary-status'),
    text: () => container.textContent ?? '',
    button: () => container.querySelector('button') as HTMLButtonElement
  }
}

describe('DictionaryStatus', () => {
  it('says it is checking, with Check again disabled, until the dictionary answers', async () => {
    const { status, text, button } = await render(() => new Promise(() => {}))
    expect(status()).toBe('checking')
    expect(text()).toContain(labels.progress.checking)
    expect(button().disabled).toBe(true)
  })

  it('shows the download, not ready, while the dictionary downloads', async () => {
    const { status, text, button } = await render(
      answering({ state: 'downloading', done: 118_500_000, total: 237_000_000 })
    )
    expect(status()).toBe('downloading')
    expect(text()).toContain('50% · 119 of 237 MB')
    expect(text()).not.toContain(labels.progress.ready)
    expect(button().disabled).toBe(true)
  })

  it('says the dictionary is ready once the data is in', async () => {
    const { status, text, button } = await render(answering(ready))
    expect(status()).toBe('ready')
    expect(text()).toContain(labels.progress.ready)
    expect(button().disabled).toBe(false)
  })

  it('says the download failed, and why, when the data failed or the worker fails', async () => {
    const failed = await render(answering({ state: 'failed', reason: 'Failed to fetch' }))
    expect(failed.status()).toBe('failed')
    expect(failed.text()).toContain(labels.progress.failed)
    expect(failed.text()).toContain('Failed to fetch')
    act(() => root?.unmount())
    const failure = await render(async () => ({ type: 'failed', reason: 'The worker failed.' }))
    expect(failure.text()).not.toContain(labels.progress.ready)
    expect(failure.text()).toContain('The worker failed.')
  })

  it('checks again on Check again', async () => {
    const check = answering({ ...ready, state: 'updating', done: 0, total: 0 })
    const { status, button } = await render(answering(ready), check)
    await act(async () => button().click())
    expect(check).toHaveBeenCalledOnce()
    expect(status()).toBe('updating')
  })
})
