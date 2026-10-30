import type { AccountApi, Failure } from './client'

export const extensionId = 'kaalpflpefadijdemimciikalgpgjmok'

export type Handover = 'signed-in' | 'signed-in-already' | 'wait' | 'try-again' | 'no-extension'

export interface ExtensionRuntime {
  sendMessage(extension: string, message: unknown, respond: (reply: unknown) => void): void
  lastError?: unknown
}

type MaybeRuntime = { chrome?: { runtime?: Partial<ExtensionRuntime> } }

export function extensionRuntime(scope: unknown = globalThis): ExtensionRuntime | null {
  const runtime = (scope as MaybeRuntime).chrome?.runtime
  return typeof runtime?.sendMessage === 'function' ? (runtime as ExtensionRuntime) : null
}

const refusals: readonly Handover[] = ['signed-in-already', 'wait', 'try-again']

export function handoverOf(reply: unknown): Handover {
  if (typeof reply !== 'object' || reply === null) return 'try-again'
  const { signedIn, refusal } = reply as { signedIn?: unknown; refusal?: unknown }
  if (signedIn === true) return 'signed-in'
  return refusals.find(each => each === refusal) ?? 'try-again'
}

function handOver(runtime: ExtensionRuntime, code: string): Promise<Handover> {
  return new Promise(resolve => {
    try {
      runtime.sendMessage(extensionId, { type: 'sign-in', code }, reply =>
        resolve(runtime.lastError ? 'no-extension' : handoverOf(reply))
      )
    } catch {
      resolve('no-extension')
    }
  })
}

export async function signInTheExtension(
  api: AccountApi,
  runtime: ExtensionRuntime | null
): Promise<{ handover: Handover } | { failure: Failure }> {
  if (runtime === null) return { handover: 'no-extension' }
  const code = await api.extensionCode()
  if (!code.ok) return { failure: code.failure }
  return { handover: await handOver(runtime, code.value) }
}
