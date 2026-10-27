import { describe, expect, it, vi } from 'vitest'
import { welcomePage } from '../shared/language-data'
import type { DictionaryRequest } from '../shared/messages'
import { keepLanguageDataCurrent, type UpdatesChrome, updateAlarm } from './language-data-updates'

function listener<Arguments extends unknown[]>() {
  const listeners: ((...args: Arguments) => void)[] = []
  return {
    addListener: (added: (...args: Arguments) => void) => {
      listeners.push(added)
    },
    fire: (...args: Arguments) => {
      for (const fired of listeners) fired(...args)
    }
  }
}

function fakeChrome() {
  const asked: DictionaryRequest[] = []
  const api = {
    onInstalled: listener<[{ reason: string }]>(),
    onStartup: listener<[]>(),
    onAlarm: listener<[{ name: string }]>(),
    createAlarm: vi.fn<UpdatesChrome['createAlarm']>(),
    hasAlarm: vi.fn<UpdatesChrome['hasAlarm']>(async () => true),
    openTab: vi.fn<UpdatesChrome['openTab']>(),
    ask: vi.fn<UpdatesChrome['ask']>(async request => {
      asked.push(request)
      return { type: 'state', data: { state: 'checking' } }
    })
  }
  keepLanguageDataCurrent(api)
  return { api, asked }
}

const settled = () => new Promise(resolve => setTimeout(resolve))

describe('keeping the language data current', () => {
  it('opens the welcome tab once, on install, and starts the download', async () => {
    const { api, asked } = fakeChrome()
    api.onInstalled.fire({ reason: 'install' })
    await settled()
    expect(api.openTab).toHaveBeenCalledExactlyOnceWith(welcomePage)
    expect(asked).toEqual([{ type: 'update' }])
  })

  it('checks for an update, without the welcome tab, when the extension updates', async () => {
    const { api, asked } = fakeChrome()
    api.onInstalled.fire({ reason: 'update' })
    await settled()
    expect(api.openTab).not.toHaveBeenCalled()
    expect(asked).toEqual([{ type: 'update' }])
  })

  it('checks once a day, from a daily alarm', async () => {
    const { api, asked } = fakeChrome()
    api.onInstalled.fire({ reason: 'install' })
    expect(api.createAlarm).toHaveBeenCalledWith(updateAlarm, {
      periodInMinutes: 1440,
      delayInMinutes: 1440
    })
    api.onAlarm.fire({ name: updateAlarm })
    api.onAlarm.fire({ name: 'another-alarm' })
    await settled()
    expect(asked).toHaveLength(2)
  })

  it('checks when the browser starts, keeping the daily alarm it has', async () => {
    const { api, asked } = fakeChrome()
    api.onStartup.fire()
    await settled()
    expect(asked).toEqual([{ type: 'update' }])
    expect(api.hasAlarm).toHaveBeenCalledWith(updateAlarm)
    expect(api.createAlarm).not.toHaveBeenCalled()
  })

  it('creates the daily alarm again when the browser starts without it', async () => {
    const { api } = fakeChrome()
    api.hasAlarm.mockResolvedValueOnce(false)
    api.onStartup.fire()
    await settled()
    expect(api.createAlarm).toHaveBeenCalledExactlyOnceWith(updateAlarm, {
      periodInMinutes: 1440,
      delayInMinutes: 1440
    })
  })

  it('keeps going when asking throws', async () => {
    const { api } = fakeChrome()
    api.ask.mockImplementationOnce(() => {
      throw new Error('Extension context invalidated.')
    })
    expect(() => api.onStartup.fire()).not.toThrow()
    await settled()
  })
})
