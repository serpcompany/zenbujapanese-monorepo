'use client'

import type { KanaScript } from '@zenbu/dictionary-core/browse/kana'
import { useId } from 'react'
import { ChoiceToggles } from '@/components/tools/choice-toggles'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
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
  const checkbox = useId()
  if (setting === 'script') {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span aria-hidden="true" className="text-muted-foreground">
          Write in
        </span>
        <ChoiceToggles
          label="Write in"
          choices={scripts}
          chosen={options.script}
          onChoose={script => onChange({ ...options, script })}
        />
      </div>
    )
  }
  return (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <legend className="sr-only">What changes</legend>
      {widthChanges.map(change => (
        <div key={change.value} className="flex items-center gap-2">
          <Checkbox
            id={`${checkbox}-${change.value}`}
            checked={options.widths[change.value]}
            onCheckedChange={checked =>
              onChange({ ...options, widths: { ...options.widths, [change.value]: checked } })
            }
          />
          <Label htmlFor={`${checkbox}-${change.value}`}>{change.label}</Label>
        </div>
      ))}
    </fieldset>
  )
}
