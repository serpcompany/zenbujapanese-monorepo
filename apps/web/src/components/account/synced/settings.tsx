'use client'

import { chosenPacks, chosenValue } from '@zenbu/account-rules/account-views'
import { defaultFrequencyPacks } from '@zenbu/dictionary-core/detail/frequency'
import { Button } from '@zenbu/ui/components/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle
} from '@zenbu/ui/components/item'
import {
  frequencyPacks,
  packName,
  settingName,
  settingValue,
  textIn
} from '@/lib/account/synced-views'
import { fill } from '@/lib/i18n/format'
import { FormMessage } from '../form-message'
import { type AreaProps, MoveButtons, useChanging } from './parts'

const chosenSetting = 'frequencyDictionaries.chosen'
const appsOwnChoice = defaultFrequencyPacks.map(pack => pack.id)

const moved = (packs: readonly string[], from: number, to: number) => {
  const next = [...packs]
  const [pack] = next.splice(from, 1)
  if (pack !== undefined) next.splice(to, 0, pack)
  return next
}

function FrequencyDictionaries({ copy, locale, text, change }: AreaProps) {
  const words = text.synced.settings.frequency
  const { busy, problem, run } = useChanging()
  const held = copy.heldOne('setting', chosenSetting)?.data
  const chosen = held ? chosenPacks(textIn(held, 'value')) : appsOwnChoice
  const others = frequencyPacks.filter(pack => !chosen.includes(pack.id))
  const choose = (packs: readonly string[]) =>
    void run(() => change('setting', 'set', chosenSetting, { value: chosenValue(packs) }))
  const named = (id: string) => packName(id, locale, text.synced)
  return (
    <section className="flex flex-col gap-3" aria-labelledby="frequency-dictionaries">
      <h2 id="frequency-dictionaries" className="text-lg font-medium">
        {words.heading}
      </h2>
      <p className="text-sm text-muted-foreground">{words.explained}</p>
      {held ? null : <p className="text-sm">{words.appsChoice}</p>}
      <FormMessage problem={problem} />
      <h3 className="font-medium">{words.chosen}</h3>
      {chosen.length === 0 ? <p className="text-muted-foreground">{words.noneChosen}</p> : null}
      <div className="flex flex-col gap-2">
        {chosen.map((id, index) => (
          <Item key={id} variant="outline">
            <ItemContent>
              <ItemTitle>{named(id)}</ItemTitle>
            </ItemContent>
            <ItemActions>
              <MoveButtons
                name={named(id)}
                up={index > 0 ? () => choose(moved(chosen, index, index - 1)) : null}
                down={
                  index < chosen.length - 1 ? () => choose(moved(chosen, index, index + 1)) : null
                }
                busy={busy}
                words={words}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                aria-label={fill(words.removeNamed, { name: named(id) })}
                onClick={() => choose(chosen.filter(each => each !== id))}
              >
                {words.remove}
              </Button>
            </ItemActions>
          </Item>
        ))}
      </div>
      {others.length > 0 ? <h3 className="font-medium">{words.others}</h3> : null}
      <div className="flex flex-col gap-2">
        {others.map(pack => (
          <Item key={pack.id} variant="outline">
            <ItemContent>
              <ItemTitle>{named(pack.id)}</ItemTitle>
            </ItemContent>
            <ItemActions>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                aria-label={fill(words.addNamed, { name: named(pack.id) })}
                onClick={() => choose([...chosen, pack.id])}
              >
                {words.add}
              </Button>
            </ItemActions>
          </Item>
        ))}
      </div>
    </section>
  )
}

function AppSettings({ copy, locale, text }: AreaProps) {
  const words = text.synced.settings
  const held = copy
    .held('setting')
    .flatMap(setting => (setting.data && setting.entityId !== chosenSetting ? [setting] : []))
  return (
    <section className="flex flex-col gap-3" aria-labelledby="app-settings">
      <h2 id="app-settings" className="text-lg font-medium">
        {words.app.heading}
      </h2>
      <p className="text-sm text-muted-foreground">{words.app.explained}</p>
      {held.length === 0 ? <p className="text-muted-foreground">{words.app.none}</p> : null}
      <div className="flex flex-col gap-2">
        {held.map(setting => (
          <Item key={setting.entityId} variant="outline">
            <ItemContent>
              <ItemTitle>{settingName(setting.entityId, words)}</ItemTitle>
              <ItemDescription>
                {settingValue(setting.entityId, setting.data?.value, locale, words)}
              </ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </div>
    </section>
  )
}

export function Settings(props: AreaProps) {
  return (
    <>
      <FrequencyDictionaries {...props} />
      <AppSettings {...props} />
    </>
  )
}
