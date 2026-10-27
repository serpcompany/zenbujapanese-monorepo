import {
  BrowserClient,
  dedupeIntegration,
  defaultStackParser,
  eventFiltersIntegration,
  functionToStringIntegration,
  globalHandlersIntegration,
  httpContextIntegration,
  init,
  linkedErrorsIntegration,
  makeFetchTransport,
  Scope
} from '@sentry/browser'
import { scrubEvent } from './scrub'

type BrowserClientOptions = ConstructorParameters<typeof BrowserClient>[0]

export type Part = 'page' | 'service-worker' | 'offscreen' | 'worker' | 'content-script'

export type ReportSettings = {
  dsn?: string
  environment?: string
  release?: string
  transport?: BrowserClientOptions['transport']
}

export type ErrorReporter = { report(error: unknown): void }

const builtSettings: ReportSettings = {
  dsn: import.meta.env.ZENBU_SENTRY_DSN,
  environment: import.meta.env.ZENBU_SENTRY_ENVIRONMENT,
  release: import.meta.env.ZENBU_SENTRY_RELEASE
}

function clientOptions(
  settings: ReportSettings,
  { catchesUncaughtErrors }: { catchesUncaughtErrors: boolean }
): BrowserClientOptions {
  return {
    dsn: settings.dsn,
    environment: settings.environment,
    release: settings.release,
    transport: settings.transport ?? makeFetchTransport,
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

export function startErrorReports(
  part: Exclude<Part, 'content-script'>,
  settings: ReportSettings = builtSettings
): void {
  if (!settings.dsn) return
  const { integrations, ...options } = clientOptions(settings, { catchesUncaughtErrors: true })
  init({ ...options, defaultIntegrations: false, integrations, initialScope: { tags: { part } } })
}

export function contentScriptErrorReports(settings: ReportSettings = builtSettings): ErrorReporter {
  if (!settings.dsn) return { report() {} }
  const client = new BrowserClient(clientOptions(settings, { catchesUncaughtErrors: false }))
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
