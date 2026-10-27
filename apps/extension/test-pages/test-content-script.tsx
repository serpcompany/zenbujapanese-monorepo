import { mountInShadowRoot } from '../src/content/shadow-mount'
import { followSettings, ReadingAidStates } from './settings-follower'
import { TestSurface } from './test-surface'

followSettings(settings =>
  mountInShadowRoot(
    <>
      <TestSurface />
      <ReadingAidStates settings={settings} />
    </>
  )
)
