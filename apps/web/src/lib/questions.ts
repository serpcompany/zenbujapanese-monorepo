export interface Question {
  question: string
  answer: string
  link?: { title: string; href: string }
}

export const faqStructuredData = (questions: readonly Question[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: questions.map(({ question, answer }) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: { '@type': 'Answer', text: answer }
  }))
})
