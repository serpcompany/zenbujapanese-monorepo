import { ChevronDownIcon } from 'lucide-react'
import { JsonLd } from '@/components/json-ld'
import { ToolSection } from '@/components/tools/tool-section'
import { faqStructuredData, type Question } from '@/lib/tools/content'

export function ToolQuestions({ questions }: { questions: readonly Question[] }) {
  return (
    <ToolSection title="Questions">
      <div className="flex max-w-2xl flex-col divide-y border-y">
        {questions.map(({ question, answer }) => (
          <details key={question} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3.5 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              {question}
              <ChevronDownIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <p className="pb-4 text-[15px] text-pretty text-muted-foreground">{answer}</p>
          </details>
        ))}
      </div>
      <JsonLd data={faqStructuredData(questions)} />
    </ToolSection>
  )
}
