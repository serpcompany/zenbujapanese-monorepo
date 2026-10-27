import type { MakeTransport, Transport } from './report-setting'

type ReportEnvelope = Parameters<Transport['send']>[0]

export type ErrorReportMessage = { target: 'service-worker'; errorReport: ReportEnvelope }

export type Forward = (message: ErrorReportMessage) => void

export function isErrorReport(message: unknown): message is ErrorReportMessage {
  if (typeof message !== 'object' || message === null) return false
  const { target, errorReport } = message as Partial<ErrorReportMessage>
  return target === 'service-worker' && Array.isArray(errorReport)
}

export function forwardingTransport(forward: Forward): MakeTransport {
  return () => ({
    send: envelope => {
      forward({ target: 'service-worker', errorReport: envelope })
      return Promise.resolve({})
    },
    flush: () => Promise.resolve(true)
  })
}

export function toServiceWorker(runtime: {
  sendMessage(message: unknown): Promise<unknown>
}): Forward {
  return message => {
    Promise.resolve()
      .then(() => runtime.sendMessage(message))
      .catch(() => undefined)
  }
}
