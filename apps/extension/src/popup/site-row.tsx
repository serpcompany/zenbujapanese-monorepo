import { Button } from '@zenbu/ui/components/button'
import { Switch } from '@zenbu/ui/components/switch'
import { GlobeIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { isZenbuOn, type Settings, sitesOffWith, writeSettings } from '../shared/settings'
import { popupLabels } from './labels'
import { allowSite, readSite, type Site } from './site'

const restricted: Site = { kind: 'restricted' }

function useSite(): [Site | null, () => void] {
  const [site, setSite] = useState<Site | null>(null)
  const read = useCallback(() => {
    readSite().then(setSite, () => setSite(restricted))
  }, [])
  useEffect(read, [read])
  return [site, read]
}

function SiteIcon({ icon }: { icon: string | null }) {
  return icon ? (
    <img src={icon} alt="" className="size-5 shrink-0 rounded-sm" />
  ) : (
    <GlobeIcon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
  )
}

function SiteLine({ icon, host, status }: { icon: string | null; host: string; status: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <SiteIcon icon={icon} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{host}</span>
        <span data-site-status className="text-xs text-muted-foreground">
          {status}
        </span>
      </div>
    </div>
  )
}

export function SiteRow({ settings }: { settings: Settings }) {
  const [site, readAgain] = useSite()
  if (!site) return null
  if (site.kind === 'restricted') {
    return (
      <div data-site="restricted" className="flex flex-col gap-0.5">
        <span data-site-status className="text-sm font-medium">
          {popupLabels.site.cantRun}
        </span>
        <span className="text-xs text-muted-foreground">{popupLabels.site.cantRunDetail}</span>
      </div>
    )
  }
  if (site.kind === 'no-access') {
    return (
      <div data-site="no-access" className="flex flex-col gap-2">
        <SiteLine icon={site.icon} host={site.host} status={popupLabels.site.noAccess} />
        <Button
          variant="outline"
          onClick={() => {
            allowSite(site.origins).then(readAgain, readAgain)
          }}
        >
          {popupLabels.site.allow}
        </Button>
      </div>
    )
  }
  const on = isZenbuOn(site.host, settings)
  return (
    <div data-site="open" className="flex items-center justify-between gap-3">
      <SiteLine
        icon={site.icon}
        host={site.host}
        status={on ? popupLabels.site.on : popupLabels.site.off}
      />
      <Switch
        aria-label={popupLabels.site.switchName(site.host)}
        checked={on}
        onCheckedChange={checked =>
          writeSettings({ 'sites.off': sitesOffWith(site.host, checked, settings) })
        }
      />
    </div>
  )
}
