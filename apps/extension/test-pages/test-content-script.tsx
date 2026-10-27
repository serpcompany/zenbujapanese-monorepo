import { mountInShadowRoot } from '../src/content/shadow-mount'
import { answerSiteRequests } from '../src/shared/page-site'
import { followSettings, ReadingAidStates } from './settings-follower'
import { TestSurface } from './test-surface'

answerSiteRequests()
followSettings(settings =>
  mountInShadowRoot(
    <>
      <TestSurface />
      <ReadingAidStates settings={settings} />
    </>
  )
)
