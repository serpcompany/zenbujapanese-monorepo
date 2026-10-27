import type { ErrorEvent } from '@sentry/browser'
import type { ErrorReportMessage } from '../error-reports/forwarding'

export function forwardedEvents(messages: ErrorReportMessage[]): ErrorEvent[] {
  return messages.flatMap(({ errorReport: [, items] }) =>
    items.map(([, payload]) => payload as ErrorEvent)
  )
}
