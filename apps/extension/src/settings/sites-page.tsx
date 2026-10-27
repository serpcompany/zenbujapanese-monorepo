import { Button } from '@zenbu/ui/components/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle
} from '@zenbu/ui/components/item'
import { GlobeIcon } from 'lucide-react'
import { type Settings, sitesOffWith, writeSettings } from '../shared/settings'
import { settingsLabels } from './labels'

export function SitesPage({ settings }: { settings: Settings }) {
  const off = settings['sites.off']
  if (off.length === 0) {
    return <p className="text-sm text-muted-foreground">{settingsLabels.sites.none}</p>
  }
  return (
    <>
      <p className="text-sm text-muted-foreground">{settingsLabels.sites.intro}</p>
      <ItemGroup>
        {off.map(host => (
          <Item key={host} variant="outline" data-site-off={host}>
            <ItemMedia variant="icon">
              <GlobeIcon />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="w-full truncate">{host}</ItemTitle>
            </ItemContent>
            <ItemActions>
              <Button
                variant="outline"
                size="sm"
                aria-label={settingsLabels.sites.turnOnFor(host)}
                onClick={() => writeSettings({ 'sites.off': sitesOffWith(host, true, settings) })}
              >
                {settingsLabels.sites.turnOn}
              </Button>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    </>
  )
}
