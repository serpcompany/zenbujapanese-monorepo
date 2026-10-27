import { captureException, close, flush } from '@sentry/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { settingDefaults } from '../shared/settings'
import { recordingSettings } from '../test/recording-settings'
import { settingStorage } from '../test/setting-storage'
import { receiveErrorReport, reportFailure, startSendingErrorReports } from './error-reports'
import { sendSetting, sendSettingKey } from './report-setting'

function start(items: Record<string, unknown> = {}, options: { held?: boolean } = {}) {
  const { settings, sent } = recordingSettings()
  const setting = settingStorage(items, options)
  startSendingErrorReports(setting.storage, settings)
  return { sent, ...setting }
}

afterEach(() => close())

const values = (sent: { exception?: { values?: { value?: string }[] } }[]) =>
  sent.map(event => event.exception?.values?.[0]?.value)

describe("the service worker's Send Crash Reports setting", () => {
  it('sends nothing, its own or forwarded, when the learner has turned reports off', async () => {
    const { sent } = start({ [sendSettingKey]: false })
    captureException(new Error('Off from the start'))
    receiveErrorReport({ target: 'service-worker', errorReport: [{}, []] })
    reportFailure('offscreen-document')
    await flush(1_000)
    expect(sent).toEqual([])
  })

  it('stops at once when turned off, and starts again when turned on, with no reload', async () => {
    const { sent, set } = start()
    captureException(new Error('On while unset'))
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    set(sendSettingKey, false)
    captureException(new Error('After turning it off'))
    await flush(1_000)
    expect(sent).toHaveLength(1)
    set(sendSettingKey, true)
    captureException(new Error('After turning it on'))
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    expect(values(sent)).toEqual(['On while unset', 'After turning it on'])
  })

  it('drops a report made before the setting is read, once it reads off', async () => {
    const { sent, release } = start({ [sendSettingKey]: false }, { held: true })
    captureException(new Error('Before the read'))
    release()
    await flush(1_000)
    expect(sent).toEqual([])
  })

  it('sends nothing when the setting cannot be read', async () => {
    const { settings, sent } = recordingSettings()
    const storage = settingStorage().storage
    startSendingErrorReports(
      { ...storage, get: () => Promise.reject(new Error('No storage')) },
      settings
    )
    captureException(new Error('Unread setting'))
    await flush(1_000)
    expect(sent).toEqual([])
  })
})

describe('Send Crash Reports, read', () => {
  it("takes its default and its kind from the settings' defaults", async () => {
    const shipped = settingDefaults[sendSettingKey]
    expect(await sendSetting(settingStorage().storage)()).toBe(shipped)
    expect(await sendSetting(settingStorage({ [sendSettingKey]: 'off' }).storage)()).toBe(shipped)
    settingDefaults[sendSettingKey] = !shipped
    try {
      expect(await sendSetting(settingStorage().storage)()).toBe(!shipped)
    } finally {
      settingDefaults[sendSettingKey] = shipped
    }
  })
})

describe('a handled failure', () => {
  it('goes as its code alone, grouped by that code', async () => {
    const { sent } = start()
    reportFailure('offscreen-message')
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]?.message).toBe('offscreen-message')
    expect(sent[0]?.level).toBe('error')
    expect(sent[0]?.fingerprint).toEqual(['handled-failure', 'offscreen-message'])
    expect(sent[0]?.tags).toEqual({ part: 'service-worker' })
  })
})
