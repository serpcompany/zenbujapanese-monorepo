import { Label } from '@zenbu/ui/components/label'
import { Switch } from '@zenbu/ui/components/switch'
import { type ReactNode, useId } from 'react'
import { readingAidKeys, type Settings, writeSettings } from '../shared/settings'
import { settingsLabels } from './labels'

export type SwitchKey = keyof typeof settingsLabels.switches

type SwitchProps = { settings: Settings; detailed?: boolean }

const details: Partial<Record<SwitchKey, string>> = settingsLabels.details

export const waitsForFurigana = (setting: SwitchKey, settings: Settings): boolean =>
  setting === 'readingAids.furiganaHiddenOnKnownWords' && !settings['readingAids.furigana']

export function SettingSwitch({
  setting,
  settings,
  detailed = true,
  disabled = false
}: SwitchProps & { setting: SwitchKey; disabled?: boolean }) {
  const id = useId()
  const detailId = `${id}-detail`
  const detail = detailed ? details[setting] : undefined
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <Label htmlFor={id}>{settingsLabels.switches[setting]}</Label>
        <Switch
          id={id}
          data-setting={setting}
          checked={settings[setting]}
          disabled={disabled}
          aria-describedby={detail ? detailId : undefined}
          onCheckedChange={checked => writeSettings({ [setting]: checked })}
        />
      </div>
      {detail ? (
        <p id={detailId} className="text-xs text-muted-foreground">
          {detail}
        </p>
      ) : null}
    </div>
  )
}

export function SwitchGroup({
  title,
  level: Heading,
  children
}: {
  title: string
  level: 'h2' | 'h3'
  children: ReactNode
}) {
  return (
    <section className="flex flex-col">
      <Heading className="text-xs font-medium text-muted-foreground">{title}</Heading>
      {children}
    </section>
  )
}

export function ReadingAidSwitches({ settings, detailed }: SwitchProps) {
  return readingAidKeys.map(setting => (
    <SettingSwitch
      key={setting}
      setting={setting}
      settings={settings}
      detailed={detailed}
      disabled={waitsForFurigana(setting, settings)}
    />
  ))
}
