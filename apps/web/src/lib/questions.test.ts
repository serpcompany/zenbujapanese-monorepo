import { expect, test } from 'vitest'
import { faqStructuredData } from './questions'

test('questions become FAQ structured data, each answer in full and without its link', () => {
  expect(
    faqStructuredData([
      {
        question: 'What is half-width katakana?',
        answer: 'A narrow form of katakana.',
        link: { title: 'Tools', href: '/tools/' }
      }
    ])
  ).toEqual({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is half-width katakana?',
        acceptedAnswer: { '@type': 'Answer', text: 'A narrow form of katakana.' }
      }
    ]
  })
})
