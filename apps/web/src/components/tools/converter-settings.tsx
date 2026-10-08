'use client'

import type { KanaScript } from '@zenbu/dictionary-core/browse/kana'
import { useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { ConverterOptions } from '@/lib/tools/convert'
import type { ConverterSetting } from '@/lib/tools/converters'
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

export function ConverterSettings({
  setting,
  options,
  onChange
}: {
  setting: ConverterSetting
  options: ConverterOptions
  onChange: (options: ConverterOptions) => void
}) {
  const id = useId()
  if (setting === 'script') {
    return (
      <div className="flex flex-col items-end gap-2">
        <span id={`${id}-write-in`} className="text-sm font-medium">
          Write in
        </span>
        <ToggleGroup
          aria-labelledby={`${id}-write-in`}
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
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Change</legend>
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
