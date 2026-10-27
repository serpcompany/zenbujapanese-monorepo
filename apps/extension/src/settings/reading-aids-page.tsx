import type { Settings } from '../shared/settings'
import { settingsLabels } from './labels'
import { ReadingAidSwitches, SettingSwitch, SwitchGroup } from './setting-switch'

export function ReadingAidsPage({ settings }: { settings: Settings }) {
  return (
    <>
      <section className="flex flex-col">
        <ReadingAidSwitches settings={settings} />
      </section>
      <SwitchGroup title={settingsLabels.videos} level="h3">
        <SettingSwitch setting="videos.zenbuCaptions" settings={settings} />
      </SwitchGroup>
      <SwitchGroup title={settingsLabels.crashReports} level="h3">
        <SettingSwitch setting="crashReports.send" settings={settings} />
      </SwitchGroup>
    </>
  )
}
