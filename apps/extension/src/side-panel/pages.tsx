import { Button } from '@zenbu/ui/components/button'
import type { ComponentType } from 'react'
import { labels } from './labels'
import type { PanelPage, PanelPageProps } from './route'

type PlaceholderPage = Extract<PanelPage, { page: 'word' | 'kanji' | 'form' }>

function PlaceholderPage({ page }: PanelPageProps<PlaceholderPage>) {
  return (
    <section className="flex flex-col gap-2 p-4">
      <h2 className="font-heading text-base font-semibold">{labels.placeholder[page.page]}</h2>
      <pre className="text-sm break-all whitespace-pre-wrap text-muted-foreground">
        {JSON.stringify(page)}
      </pre>
    </section>
  )
}

function TestPage({ page, open }: PanelPageProps<Extract<PanelPage, { page: 'test' }>>) {
  return (
    <section className="flex flex-col items-start gap-3 p-4">
      <h2 className="font-heading text-base font-semibold">{labels.testPage.title}</h2>
      <p data-test-page className="text-sm break-words">
        {page.text}
      </p>
      <Button variant="outline" onClick={() => open({ page: 'test', text: `${page.text} +` })}>
        {labels.testPage.openAnother}
      </Button>
    </section>
  )
}

export const pages: {
  [K in PanelPage['page']]: ComponentType<PanelPageProps<Extract<PanelPage, { page: K }>>>
} = {
  word: PlaceholderPage,
  kanji: PlaceholderPage,
  form: PlaceholderPage,
  test: TestPage
}
