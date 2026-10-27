import { createTransport, type ErrorEvent } from '@sentry/browser'
import type { ReportSettings } from '../error-reports/error-reports'

export function recordingSettings(): { settings: ReportSettings; sent: ErrorEvent[] } {
  const sent: ErrorEvent[] = []
  const transport = (options: Parameters<typeof createTransport>[0]) =>
    createTransport(options, async request => {
      const [, , item] = String(request.body).split('\n')
      sent.push(JSON.parse(item ?? '{}'))
      return {}
    })
  return {
    sent,
    settings: {
      dsn: 'https://public@sentry.example.invalid/1',
      environment: 'qa',
      release: 'zenbujapanese-extension@0.1.0',
      transport
    }
  }
}
