import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Ask, DictionaryStatus } from './dictionary-status'
import { labels } from './labels'
import type { DictionaryAnswer, Failure } from './messages'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const pong: DictionaryAnswer = { type: 'pong', from: 'dictionary-worker' }
const failed: Failure = { type: 'failed', reason: 'The dictionary worker failed.' }

let root: Root | undefined

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

async function render(ask: Ask) {
  const container = document.body.appendChild(document.createElement('div'))
  await act(async () => {
    root = createRoot(container)
    root.render(<DictionaryStatus ask={ask} />)
  })
  return {
    status: () => container.querySelector('[data-dictionary-status]'),
    button: () => container.querySelector('button') as HTMLButtonElement
  }
}

function pending() {
  let answer!: (value: DictionaryAnswer | Failure) => void
  const ask = vi.fn<Ask>(() => new Promise(resolve => (answer = resolve)))
  return { ask, answer: (value: DictionaryAnswer | Failure) => answer(value) }
}

describe('DictionaryStatus', () => {
  it('says it is checking, with Check again disabled, until the dictionary answers', async () => {
    const { ask, answer } = pending()
    const { status, button } = await render(ask)
    expect(status()?.textContent).toBe(labels.dictionary.checking)
    expect(button().disabled).toBe(true)
    await act(async () => answer(pong))
    expect(status()?.getAttribute('data-dictionary-status')).toBe('ready')
    expect(status()?.textContent).toBe(labels.dictionary.ready)
    expect(button().disabled).toBe(false)
  })

  it('says the dictionary is not answering when the answer is a failure', async () => {
    const { status } = await render(async () => failed)
    expect(status()?.textContent).toBe(labels.dictionary.failed)
  })

  it('says the dictionary is not answering when asking rejects', async () => {
    const { status, button } = await render(() => Promise.reject(new Error('Gone.')))
    expect(status()?.textContent).toBe(labels.dictionary.failed)
    expect(button().disabled).toBe(false)
  })

  it('says the dictionary is not answering when asking throws', async () => {
    const { status } = await render(() => {
      throw new Error('Extension context invalidated.')
    })
    expect(status()?.textContent).toBe(labels.dictionary.failed)
  })

  it('asks again on Check again, and is checking while it does', async () => {
    const ask = vi.fn<Ask>().mockResolvedValueOnce(failed)
    const { status, button } = await render(ask)
    expect(status()?.textContent).toBe(labels.dictionary.failed)
    const { ask: second, answer } = pending()
    ask.mockImplementation(second)
    await act(async () => button().click())
    expect(ask).toHaveBeenCalledTimes(2)
    expect(status()?.textContent).toBe(labels.dictionary.checking)
    expect(button().disabled).toBe(true)
    await act(async () => answer(pong))
    expect(status()?.textContent).toBe(labels.dictionary.ready)
  })
})
