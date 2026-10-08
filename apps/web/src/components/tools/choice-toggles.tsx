'use client'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export function ChoiceToggles<Choice extends string>({
  label,
  choices,
  chosen,
  onChoose,
  className
}: {
  label: string
  choices: readonly { value: Choice; label: string }[]
  chosen: Choice
  onChoose: (choice: Choice) => void
  className?: string
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[chosen]}
      onValueChange={values => {
        const choice = choices.find(candidate => candidate.value === values[0])
        if (choice) onChoose(choice.value)
      }}
      variant="outline"
      size="sm"
      className={cn('flex-wrap', className)}
    >
      {choices.map(choice => (
        <ToggleGroupItem
          key={choice.value}
          value={choice.value}
          className="rounded-full px-3 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/80 aria-pressed:hover:text-primary-foreground"
        >
          {choice.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
