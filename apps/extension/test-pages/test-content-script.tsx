import { mountInShadowRoot } from '../src/content/shadow-mount'
import { contentScriptErrorReports } from '../src/error-reports/error-reports'
import { TestSurface } from './test-surface'

mountInShadowRoot(<TestSurface />, { report: contentScriptErrorReports().report })
