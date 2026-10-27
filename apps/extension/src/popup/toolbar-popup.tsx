import { Button } from '@zenbu/ui/components/button'
import { Separator } from '@zenbu/ui/components/separator'
import { PanelRightIcon, SettingsIcon } from 'lucide-react'
import mark from '../../../../assets/brand/vector/zenbu-icon-flat-vector.svg'
import { ReadingAidSwitches, SettingSwitch, SwitchGroup } from '../settings/setting-switch'
import { useSettings } from '../shared/use-settings'
import { openPanel } from '../side-panel/route'
import { DictionaryDownload } from './dictionary-download'
import { popupLabels } from './labels'
import { SiteRow } from './site-row'

export function ToolbarPopup() {
  const settings = useSettings()
  return (
    <main className="flex w-80 flex-col gap-3 p-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <img src={mark} alt="" className="size-6" />
          <h1 className="font-heading text-base font-semibold">{popupLabels.title}</h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={popupLabels.openSettings}
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          <SettingsIcon />
        </Button>
      </header>
      {settings ? (
        <>
          <SiteRow settings={settings} />
          <DictionaryDownload />
          <Separator />
          <SwitchGroup title={popupLabels.readingAids} level="h2">
            <ReadingAidSwitches settings={settings} detailed={false} />
          </SwitchGroup>
          <SwitchGroup title={popupLabels.videos} level="h2">
            <SettingSwitch setting="videos.zenbuCaptions" settings={settings} detailed={false} />
          </SwitchGroup>
          <Separator />
        </>
      ) : null}
      <Button
        variant="outline"
        onClick={() => {
          openPanel({}).then(() => window.close())
        }}
      >
        <PanelRightIcon data-icon="inline-start" />
        {popupLabels.openSidePanel}
      </Button>
    </main>
  )
}
