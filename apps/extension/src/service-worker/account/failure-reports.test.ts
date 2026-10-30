import { close } from '@sentry/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportFailure, startSendingErrorReports } from '../../error-reports/error-reports'
import {
  extensionId,
  json,
  signedInAnswer,
  standInIdentity,
  standInService,
  storageArea,
  user
} from '../../test/account-stand-in'
import { quietCopyParts } from '../../test/copy-stand-in'
import { recordingSettings } from '../../test/recording-settings'
import { settingStorage } from '../../test/setting-storage'
import { startAccount } from './channel'

const secrets = {
  sessionToken: 'session-secret-7f3a',
  accessToken: 'access-secret-91c2',
  code: '482913',
  email: user.email
}

const everySecret = Object.values(secrets).join(' ')

afterEach(() => close())

function startedWithReports() {
  const { settings, sent } = recordingSettings()
  startSendingErrorReports(settingStorage().storage, settings)
  const local = storageArea()
  let failing = false
  const failingWhenAsked = <T>(write: () => Promise<T>) =>
    failing ? Promise.reject(new Error(everySecret)) : write()
  const listeners: ((
    message: unknown,
    sender: object,
    respond: (answer: unknown) => void
  ) => boolean)[] = []
  const service = standInService({
    'POST /v1/auth/email-otp/send-verification-otp': () => json(200, { success: true }),
    'POST /v1/auth/sign-in/email-otp': () => signedInAnswer(secrets.sessionToken),
    'GET /v1/auth/token': () => json(200, { token: secrets.accessToken }),
    'GET /v1/me/subscription': () =>
      json(500, { error: { code: 'internal', message: everySecret } })
  })
  startAccount({
    storage: {
      local: {
        get: keys => failingWhenAsked(() => local.area.get(keys)),
        set: items => failingWhenAsked(() => local.area.set(items)),
        remove: keys => local.area.remove(keys),
        setAccessLevel: () => Promise.reject(new Error(everySecret))
      },
      session: storageArea().area
    },
    identity: standInIdentity().identity,
    extensionId,
    onMessage: { addListener: listener => listeners.push(listener) },
    onStartup: { addListener: () => undefined },
    send: service.send,
    copy: quietCopyParts(),
    reportFailure
  })
  const ask = (account: unknown) =>
    new Promise(resolve =>
      listeners[0]?.(
        { target: 'service-worker', account },
        { origin: `chrome-extension://${extensionId}` },
        resolve
      )
    )
  return { sent, ask, fail: () => (failing = true) }
}

describe("the account's failure reports", () => {
  it('hold their code alone, never a session token, an access token, an emailed code, or an email', async () => {
    const { sent, ask, fail } = startedWithReports()
    await vi.waitFor(() => expect(sent).toHaveLength(1))
    await ask({ account: 'send-code', email: secrets.email })
    await ask({
      account: 'sign-in',
      with: { way: 'code', email: secrets.email, code: secrets.code }
    })
    fail()
    await expect(
      ask({ account: 'sign-in', with: { way: 'code', email: secrets.email, code: secrets.code } })
    ).resolves.toMatchObject({ type: 'failed' })
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    expect(sent.map(event => event.message)).toEqual(['account-storage', 'account-answer'])
    const reports = JSON.stringify(sent)
    for (const [kind, secret] of Object.entries(secrets)) {
      expect(reports.includes(secret), kind).toBe(false)
    }
  })
})
