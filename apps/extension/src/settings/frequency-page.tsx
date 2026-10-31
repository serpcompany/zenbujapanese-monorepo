import { Button } from '@zenbu/ui/components/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle
} from '@zenbu/ui/components/item'
import { Switch } from '@zenbu/ui/components/switch'
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import { type Settings, writeSettings } from '../shared/settings'
import { chosenWith, frequencyRows, moved } from './frequency-order'
import { settingsLabels } from './labels'

export function FrequencyPage({ settings }: { settings: Settings }) {
  const rows = frequencyRows(settings)
  return (
    <>
      <p className="text-sm text-muted-foreground">{settingsLabels.frequency.intro}</p>
      <ItemGroup>
        {rows.map(({ dictionary, chosen }, index) => (
          <Item key={dictionary.id} variant="outline" data-frequency={dictionary.id}>
            <ItemContent className="min-w-40">
              <ItemTitle>{dictionary.name}</ItemTitle>
              <ItemDescription>{dictionary.domain}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={settingsLabels.frequency.moveUp(dictionary.name)}
                disabled={index === 0}
                onClick={() => writeSettings(moved(settings, dictionary.id, -1))}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={settingsLabels.frequency.moveDown(dictionary.name)}
                disabled={index === rows.length - 1}
                onClick={() => writeSettings(moved(settings, dictionary.id, 1))}
              >
                <ArrowDownIcon />
              </Button>
              <Switch
                aria-label={dictionary.name}
                checked={chosen}
                onCheckedChange={checked =>
                  writeSettings(chosenWith(settings, dictionary.id, checked))
                }
              />
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    </>
  )
}
