import Link from 'next/link'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import type { Question } from '@/lib/questions'

export function QuestionList({
  questions,
  openFirst = false,
  className
}: {
  questions: readonly Question[]
  openFirst?: boolean
  className?: string
}) {
  return (
    <Accordion defaultValue={openFirst ? [questions[0]?.question] : []} className={className}>
      {questions.map(item => (
        <AccordionItem key={item.question} value={item.question}>
          <AccordionTrigger>{item.question}</AccordionTrigger>
          <AccordionContent keepMounted>
            <p className="text-muted-foreground">{item.answer}</p>
            {item.link ? (
              <p>
                <Link href={item.link.href}>{item.link.title}</Link>
              </p>
            ) : null}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
