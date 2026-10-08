import { JsonLd } from '@/components/json-ld'
import { QuestionList } from '@/components/question-list'
import { ToolSection } from '@/components/tools/tool-section'
import { faqStructuredData, type Question } from '@/lib/questions'

export function ToolQuestions({ questions }: { questions: readonly Question[] }) {
  return (
    <ToolSection title="Questions">
      <QuestionList questions={questions} />
      <JsonLd data={faqStructuredData(questions)} />
    </ToolSection>
  )
}
