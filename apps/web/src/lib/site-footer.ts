import {
  frequencyDictionariesPath,
  kanaChartsPath,
  kanjiListsPath
} from '@/lib/dictionary/browse/paths'
import { pageFor } from '@/lib/pages'

type FooterLink = { title: string; path: string }

const page = (path: Parameters<typeof pageFor>[0], title?: string): FooterLink => ({
  title: title ?? pageFor(path).title,
  path
})

export const footerColumns: readonly { heading: string; links: readonly FooterLink[] }[] = [
  {
    heading: 'Products',
    links: [page('/dictionary/', 'Dictionary')]
  },
  {
    heading: 'Tools',
    links: [
      { title: 'Kana charts', path: kanaChartsPath },
      { title: 'Kanji lists', path: kanjiListsPath },
      { title: 'Frequency lists', path: frequencyDictionariesPath }
    ]
  },
  {
    heading: 'Company',
    links: [page('/about/'), page('/support/'), page('/contact/'), page('/sources/')]
  },
  {
    heading: 'Legal',
    links: [
      page('/legal/privacy/'),
      page('/legal/terms/'),
      page('/legal/dmca/', 'DMCA'),
      page('/legal/affiliate-disclosure/')
    ]
  }
]
