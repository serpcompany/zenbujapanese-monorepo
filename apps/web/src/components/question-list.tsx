import Link from 'next/link'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import type { Question } from '@/lib/questions'
import { cn } from '@/lib/utils'

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
    <Accordion
      defaultValue={openFirst ? [questions[0]?.question] : []}
      className={cn('w-full max-w-2xl border-y', className)}
    >
      {questions.map(item => (
        <AccordionItem key={item.question} value={item.question}>
          <AccordionTrigger className="py-3.5 text-base hover:no-underline">
            {item.question}
          </AccordionTrigger>
          <AccordionContent keepMounted className="pb-4 text-[15px] text-muted-foreground">
            <p>{item.answer}</p>
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
