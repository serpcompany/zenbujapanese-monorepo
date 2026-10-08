'use client'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

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
      className={className}
    >
      {choices.map(choice => (
        <ToggleGroupItem key={choice.value} value={choice.value}>
          {choice.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
