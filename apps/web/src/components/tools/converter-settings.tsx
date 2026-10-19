'use client'

import type { KanaScript } from '@zenbu/dictionary-core/browse/kana'
import { useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Dictionary } from '@/lib/i18n/dictionary'
import type { ConverterOptions } from '@/lib/tools/convert'
import type { WidthOptions } from '@/lib/tools/width'

const scripts: readonly KanaScript[] = ['hiragana', 'katakana']

const widthChanges: readonly (keyof WidthOptions)[] = [
  'katakana',
  'lettersAndNumbers',
  'symbolsAndSpaces'
]

interface SettingProps {
  options: ConverterOptions
  onChange: (options: ConverterOptions) => void
  text: Pick<Dictionary['tools']['converter'], 'writeIn' | 'change' | 'scripts' | 'widths'>
}

export function ScriptSetting({ options, onChange, text }: SettingProps) {
  const label = useId()
  return (
    <div className="flex flex-col items-end gap-2">
      <span id={label} className="text-sm font-medium">
        {text.writeIn}
      </span>
      <ToggleGroup
        aria-labelledby={label}
        value={[options.script]}
        onValueChange={values => {
          const script = scripts.find(choice => choice === values[0])
          if (script) onChange({ ...options, script })
        }}
        variant="outline"
      >
        {scripts.map(script => (
          <ToggleGroupItem key={script} value={script}>
            {text.scripts[script]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

export function WidthSettings({ options, onChange, text }: SettingProps) {
  const id = useId()
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{text.change}</legend>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {widthChanges.map(change => (
          <div key={change} className="flex items-center gap-2">
            <Checkbox
              id={`${id}-${change}`}
              checked={options.widths[change]}
              onCheckedChange={checked =>
                onChange({ ...options, widths: { ...options.widths, [change]: checked } })
              }
            />
            <Label htmlFor={`${id}-${change}`}>{text.widths[change]}</Label>
          </div>
        ))}
      </div>
    </fieldset>
  )
}
