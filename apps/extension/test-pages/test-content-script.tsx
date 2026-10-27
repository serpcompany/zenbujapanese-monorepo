import { mountInShadowRoot } from '../src/content/shadow-mount'
import { contentScriptErrorReports } from '../src/error-reports/error-reports'
import { toServiceWorker } from '../src/error-reports/forwarding'
import { TestSurface } from './test-surface'

mountInShadowRoot(<TestSurface />, {
  report: contentScriptErrorReports(toServiceWorker(chrome.runtime)).report
})
