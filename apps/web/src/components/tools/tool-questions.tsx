import { JsonLd } from '@/components/json-ld'
import { QuestionList } from '@/components/question-list'
import { ToolSection } from '@/components/tools/tool-section'
import { faqStructuredData, type Question } from '@/lib/questions'

export function ToolQuestions({
  title,
  questions
}: {
  title: string
  questions: readonly Question[]
}) {
  return (
    <ToolSection title={title}>
      <QuestionList questions={questions} />
      <JsonLd data={faqStructuredData(questions)} />
    </ToolSection>
  )
}
