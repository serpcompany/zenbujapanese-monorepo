import { Button } from '@zenbu/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@zenbu/ui/components/dropdown-menu'
import { Switch } from '@zenbu/ui/components/switch'
import { BookOpenIcon, SettingsIcon, SlidersHorizontalIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { settingsLabels } from '../settings/labels'
import { type SwitchKey, waitsForFurigana } from '../settings/setting-switch'
import { openWelcomeTab } from '../shared/dictionary'
import { useDataState } from '../shared/dictionary-progress'
import {
  isZenbuOn,
  readingAidKeys,
  type Settings,
  sitesOffWith,
  writeSettings
} from '../shared/settings'
import { useSettings } from '../shared/use-settings'
import { allowSite, readActiveSite, type Site, watchActiveTab } from './active-site'

const cantRun: Site = { kind: 'cant-run' }

function useActiveSite(): [Site | null, () => void] {
  const [site, setSite] = useState<Site | null>(null)
  const latest = useRef(0)
  const read = useCallback(() => {
    latest.current += 1
    const asked = latest.current
    readActiveSite()
      .catch(() => cantRun)
      .then(next => {
        if (asked === latest.current) setSite(next)
      })
  }, [])
  useEffect(() => {
    read()
    const stopWatching = watchActiveTab(read)
    return () => {
      latest.current += 1
      stopWatching()
    }
  }, [read])
  return [site, read]
}

function SiteSwitch({ host, settings }: { host: string; settings: Settings }) {
  return (
    <Switch
      aria-label={settingsLabels.site.switchName(host)}
      title={settingsLabels.site.switchName(host)}
      checked={isZenbuOn(host, settings)}
      onCheckedChange={on => writeSettings({ 'sites.off': sitesOffWith(host, on, settings) })}
    />
  )
}

function SiteLabel({ host, status, detail }: { host: string; status: string; detail?: string }) {
  return (
    <DropdownMenuLabel className="flex flex-col gap-0.5">
      <span className="truncate text-sm font-medium text-foreground">{host}</span>
      <span data-site-status>{status}</span>
      {detail ? <span className="font-normal">{detail}</span> : null}
    </DropdownMenuLabel>
  )
}

function SiteGroup({
  site,
  settings,
  readAgain
}: {
  site: Site
  settings: Settings
  readAgain(): void
}) {
  const labels = settingsLabels.site
  if (site.kind === 'cant-run') {
    return (
      <DropdownMenuGroup data-site={site.kind}>
        <SiteLabel host={labels.thisPage} status={labels.cantRun} detail={labels.cantRunDetail} />
      </DropdownMenuGroup>
    )
  }
  if (site.kind === 'no-access') {
    return (
      <DropdownMenuGroup data-site={site.kind}>
        <SiteLabel host={site.host} status={labels.noAccess} />
        <DropdownMenuItem onClick={() => allowSite(site.origins).then(readAgain, readAgain)}>
          {labels.allow}
        </DropdownMenuItem>
      </DropdownMenuGroup>
    )
  }
  return (
    <DropdownMenuGroup data-site={site.kind}>
      <SiteLabel
        host={site.host}
        status={isZenbuOn(site.host, settings) ? labels.on : labels.off}
      />
    </DropdownMenuGroup>
  )
}

function SwitchItem({ setting, settings }: { setting: SwitchKey; settings: Settings }) {
  const on = settings[setting]
  const disabled = waitsForFurigana(setting, settings)
  return (
    <DropdownMenuItem
      role="menuitemcheckbox"
      aria-checked={on}
      data-setting={setting}
      disabled={disabled}
      closeOnClick={false}
      className="justify-between gap-3"
      onClick={() => writeSettings({ [setting]: !on })}
    >
      {settingsLabels.switches[setting]}
      <Switch
        aria-hidden
        tabIndex={-1}
        checked={on}
        disabled={disabled}
        className="pointer-events-none"
      />
    </DropdownMenuItem>
  )
}

function MenuSwitches({
  title,
  settings,
  keys
}: {
  title: string
  settings: Settings
  keys: readonly SwitchKey[]
}) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{title}</DropdownMenuLabel>
      {keys.map(setting => (
        <SwitchItem key={setting} setting={setting} settings={settings} />
      ))}
    </DropdownMenuGroup>
  )
}

function HeaderMenu({
  site,
  settings,
  readAgain
}: {
  site: Site | null
  settings: Settings
  readAgain(): void
}) {
  const [data] = useDataState()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label={settingsLabels.menu.open} />}
      >
        <SlidersHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {site ? (
          <>
            <SiteGroup site={site} settings={settings} readAgain={readAgain} />
            <DropdownMenuSeparator />
          </>
        ) : null}
        <MenuSwitches
          title={settingsLabels.pages.readingAids}
          settings={settings}
          keys={readingAidKeys}
        />
        <DropdownMenuSeparator />
        <MenuSwitches
          title={settingsLabels.videos}
          settings={settings}
          keys={['videos.zenbuCaptions']}
        />
        <DropdownMenuSeparator />
        {data?.state === 'downloading' ? (
          <DropdownMenuItem onClick={() => openWelcomeTab()}>
            <BookOpenIcon />
            {settingsLabels.menu.showWelcome}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => chrome.runtime.openOptionsPage()}>
          <SettingsIcon />
          {settingsLabels.title}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function HeaderControls() {
  const settings = useSettings()
  const [site, readAgain] = useActiveSite()
  if (!settings) return null
  return (
    <div className="flex shrink-0 items-center gap-1">
      {site?.kind === 'open' ? <SiteSwitch host={site.host} settings={settings} /> : null}
      <HeaderMenu site={site} settings={settings} readAgain={readAgain} />
    </div>
  )
}
