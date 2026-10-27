import { welcomePage } from '../shared/language-data'
import type { DictionaryAnswer, DictionaryRequest, Failure } from '../shared/messages'

export const updateAlarm = 'language-data-update'

const dayInMinutes = 24 * 60

type Listener<Arguments extends unknown[]> = {
  addListener(listener: (...args: Arguments) => void): void
}

export type UpdatesChrome = {
  onInstalled: Listener<[{ reason: string }]>
  onStartup: Listener<[]>
  onAlarm: Listener<[{ name: string }]>
  createAlarm(name: string, info: { periodInMinutes: number; delayInMinutes: number }): void
  openTab(path: string): void
  ask(request: DictionaryRequest): Promise<DictionaryAnswer | Failure>
}

export function keepLanguageDataCurrent(api: UpdatesChrome) {
  const update = () => {
    Promise.resolve()
      .then(() => api.ask({ type: 'update' }))
      .catch(() => undefined)
  }
  api.onInstalled.addListener(({ reason }) => {
    api.createAlarm(updateAlarm, { periodInMinutes: dayInMinutes, delayInMinutes: dayInMinutes })
    if (reason === 'install') api.openTab(welcomePage)
    update()
  })
  api.onStartup.addListener(update)
  api.onAlarm.addListener(({ name }) => {
    if (name === updateAlarm) update()
  })
}
