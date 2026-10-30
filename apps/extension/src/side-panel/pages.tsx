import { Button } from '@zenbu/ui/components/button'
import type { ComponentType } from 'react'
import { ImageSearchPage } from '../translate/image-search-page'
import { labels } from './labels'
import type { PanelPage, PanelPageProps } from './route'

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
  'image-search': ImageSearchPage,
  test: TestPage
}
