import { mountInShadowRoot } from '../src/content/shadow-mount'
import { contentScriptErrorReports } from '../src/error-reports/error-reports'
import { toServiceWorker } from '../src/error-reports/forwarding'
import { followSettings, ReadingAidStates } from './settings-follower'
import { TestSurface } from './test-surface'

const { report } = contentScriptErrorReports(toServiceWorker(chrome.runtime))

followSettings(settings =>
  mountInShadowRoot(
    <>
      <TestSurface />
      <ReadingAidStates settings={settings} />
    </>,
    { report }
  )
)
