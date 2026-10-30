import { afterEach, describe, expect, test, vi } from 'vitest'
import { answer, apiUrl, refusal, stubAccountService } from '@/test/account-page'
import { accountApi } from './client'
import {
  type ExtensionRuntime,
  extensionId,
  extensionRuntime,
  handoverOf,
  signInTheExtension
} from './extension'

afterEach(() => vi.unstubAllGlobals())

const api = () => accountApi(apiUrl, 'en')

function runtimeAnswering(reply: unknown, lastError?: unknown) {
  const runtime: ExtensionRuntime = {
    sendMessage: vi.fn((_extension, _message, respond) => {
      runtime.lastError = lastError
      respond(reply)
    })
  }
  return runtime
}

describe('extensionRuntime', () => {
  test('finds the runtime only where a page can message an extension', () => {
    const sendMessage = () => undefined
    expect(extensionRuntime({ chrome: { runtime: { sendMessage } } })?.sendMessage).toBe(
      sendMessage
    )
    for (const scope of [
      {},
      { chrome: {} },
      { chrome: { runtime: {} } },
      { chrome: { runtime: { sendMessage: 1 } } }
    ]) {
      expect(extensionRuntime(scope)).toBeNull()
    }
  })
})

describe('handoverOf', () => {
  test("reads the extension's answer, and takes anything else as Try again", () => {
    expect(handoverOf({ signedIn: true })).toBe('signed-in')
    expect(handoverOf({ signedIn: false, refusal: 'signed-in-already' })).toBe('signed-in-already')
    expect(handoverOf({ signedIn: false, refusal: 'wait' })).toBe('wait')
    expect(handoverOf({ signedIn: false, refusal: 'try-again' })).toBe('try-again')
    for (const reply of [
      undefined,
      null,
      'yes',
      { signedIn: 'true' },
      { refusal: 'no-extension' }
    ]) {
      expect(handoverOf(reply)).toBe('try-again')
    }
  })
})

describe('signInTheExtension', () => {
  test("asks for a code with the website's session and hands it to the extension alone", async () => {
    const { calls } = stubAccountService({
      'POST /v1/auth/extension-code': answer({ code: 'website-code', expiresIn: 300 })
    })
    const runtime = runtimeAnswering({ signedIn: true })
    await expect(signInTheExtension(api(), runtime)).resolves.toEqual({ handover: 'signed-in' })
    expect(calls).toEqual([
      expect.objectContaining({ route: 'POST /v1/auth/extension-code', credentials: 'include' })
    ])
    expect(runtime.sendMessage).toHaveBeenCalledWith(
      extensionId,
      { type: 'sign-in', code: 'website-code' },
      expect.any(Function)
    )
  })

  test('asks for no code where no extension can be messaged', async () => {
    const { calls } = stubAccountService({})
    await expect(signInTheExtension(api(), null)).resolves.toEqual({ handover: 'no-extension' })
    expect(calls).toEqual([])
  })

  test('takes a missing extension, or one that throws, as no extension', async () => {
    stubAccountService({
      'POST /v1/auth/extension-code': answer({ code: 'website-code', expiresIn: 300 })
    })
    const missing = runtimeAnswering(undefined, { message: 'Could not establish connection.' })
    await expect(signInTheExtension(api(), missing)).resolves.toEqual({ handover: 'no-extension' })
    const throwing: ExtensionRuntime = {
      sendMessage: () => {
        throw new TypeError('Invalid extension id')
      }
    }
    await expect(signInTheExtension(api(), throwing)).resolves.toEqual({ handover: 'no-extension' })
  })

  test("passes on the service's refusal, and messages no extension", async () => {
    stubAccountService({ 'POST /v1/auth/extension-code': refusal(401, 'unauthorized') })
    const runtime = runtimeAnswering({ signedIn: true })
    const outcome = await signInTheExtension(api(), runtime)
    expect(outcome).toMatchObject({ failure: { status: 401 } })
    expect(runtime.sendMessage).not.toHaveBeenCalled()
  })
})
