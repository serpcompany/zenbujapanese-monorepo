import {
  BrowserClient,
  captureMessage,
  dedupeIntegration,
  defaultStackParser,
  eventFiltersIntegration,
  functionToStringIntegration,
  getClient,
  globalHandlersIntegration,
  httpContextIntegration,
  init,
  linkedErrorsIntegration,
  makeFetchTransport,
  Scope
} from '@sentry/browser'
import { type Forward, forwardingTransport, isErrorReport } from './forwarding'
import {
  gatedTransport,
  type MakeTransport,
  type SettingStorage,
  sendSetting
} from './report-setting'
import { scrubEvent } from './scrub'

type BrowserClientOptions = ConstructorParameters<typeof BrowserClient>[0]

export type Part = 'page' | 'service-worker' | 'offscreen' | 'worker' | 'content-script'

export type ReportSettings = {
  dsn?: string
  environment?: string
  release?: string
  transport?: MakeTransport
}

export type ErrorReporter = { report(error: unknown): void }

const builtSettings: ReportSettings = {
  dsn: import.meta.env.ZENBU_SENTRY_DSN,
  environment: import.meta.env.ZENBU_SENTRY_ENVIRONMENT,
  release: import.meta.env.ZENBU_SENTRY_RELEASE
}

function clientOptions(
  settings: ReportSettings,
  transport: MakeTransport,
  { catchesUncaughtErrors }: { catchesUncaughtErrors: boolean }
): BrowserClientOptions {
  return {
    dsn: settings.dsn,
    environment: settings.environment,
    release: settings.release,
    transport,
    transportOptions: { fetchOptions: { referrerPolicy: 'no-referrer' } },
    stackParser: defaultStackParser,
    integrations: [
      eventFiltersIntegration(),
      functionToStringIntegration(),
      linkedErrorsIntegration(),
      dedupeIntegration(),
      httpContextIntegration(),
      ...(catchesUncaughtErrors ? [globalHandlersIntegration()] : [])
    ],
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ['User-Agent'] }, response: false },
      urlQueryParams: false,
      stackFrameVariables: false,
      frameContextLines: 0
    },
    sendClientReports: false,
    beforeBreadcrumb: () => null,
    beforeSend: scrubEvent
  }
}

function start(part: Exclude<Part, 'content-script'>, options: BrowserClientOptions): void {
  const { integrations, ...rest } = options
  init({ ...rest, defaultIntegrations: false, integrations, initialScope: { tags: { part } } })
}

export function startSendingErrorReports(
  storage: SettingStorage,
  settings: ReportSettings = builtSettings
): void {
  if (!settings.dsn) return
  const transport = gatedTransport(settings.transport ?? makeFetchTransport, sendSetting(storage))
  start('service-worker', clientOptions(settings, transport, { catchesUncaughtErrors: true }))
}

export function startErrorReports(
  part: Exclude<Part, 'content-script' | 'service-worker'>,
  forward: Forward,
  settings: ReportSettings = builtSettings
): void {
  if (!settings.dsn) return
  const transport = forwardingTransport(forward)
  start(part, clientOptions(settings, transport, { catchesUncaughtErrors: true }))
}

export function contentScriptErrorReports(
  forward: Forward,
  settings: ReportSettings = builtSettings
): ErrorReporter {
  if (!settings.dsn) return { report() {} }
  const transport = forwardingTransport(forward)
  const client = new BrowserClient(
    clientOptions(settings, transport, { catchesUncaughtErrors: false })
  )
  const scope = new Scope()
  scope.setClient(client)
  scope.setTag('part', 'content-script')
  client.init()
  return {
    report(error) {
      scope.captureException(error)
    }
  }
}

export function receiveErrorReport(message: unknown): boolean {
  if (isErrorReport(message)) getClient()?.getTransport()?.send(message.errorReport)
  return false
}

export function reportFailure(code: string): void {
  captureMessage(code, { level: 'error', fingerprint: ['handled-failure', code] })
}
