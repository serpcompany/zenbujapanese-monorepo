'use client'

import type { KanaScript } from '@zenbu/dictionary-core/browse/kana'
import { useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { ConverterOptions } from '@/lib/tools/convert'
import type { WidthOptions } from '@/lib/tools/width'

const scripts: readonly { value: KanaScript; label: string }[] = [
  { value: 'hiragana', label: 'Hiragana' },
  { value: 'katakana', label: 'Katakana' }
]

const widthChanges: readonly { value: keyof WidthOptions; label: string }[] = [
  { value: 'katakana', label: 'Katakana' },
  { value: 'lettersAndNumbers', label: 'Letters and numbers' },
  { value: 'symbolsAndSpaces', label: 'Symbols and spaces' }
]

interface SettingProps {
  options: ConverterOptions
  onChange: (options: ConverterOptions) => void
}

export function ScriptSetting({ options, onChange }: SettingProps) {
  const label = useId()
  return (
    <div className="flex flex-col items-end gap-2">
      <span id={label} className="text-sm font-medium">
        Write in
      </span>
      <ToggleGroup
        aria-labelledby={label}
        value={[options.script]}
        onValueChange={values => {
          const script = scripts.find(choice => choice.value === values[0])
          if (script) onChange({ ...options, script: script.value })
        }}
        variant="outline"
      >
        {scripts.map(script => (
          <ToggleGroupItem key={script.value} value={script.value}>
            {script.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

export function WidthSettings({ options, onChange }: SettingProps) {
  const id = useId()
  return (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <legend className="sr-only">Change</legend>
      <span aria-hidden="true" className="text-sm font-medium">
        Change
      </span>
      {widthChanges.map(change => (
        <div key={change.value} className="flex items-center gap-2">
          <Checkbox
            id={`${id}-${change.value}`}
            checked={options.widths[change.value]}
            onCheckedChange={checked =>
              onChange({ ...options, widths: { ...options.widths, [change.value]: checked } })
            }
          />
          <Label htmlFor={`${id}-${change.value}`}>{change.label}</Label>
        </div>
      ))}
    </fieldset>
  )
}
