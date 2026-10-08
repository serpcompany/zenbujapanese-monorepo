import {
  frequencyDictionariesPath,
  kanaChartsPath,
  kanjiListsPath
} from '@/lib/dictionary/browse/paths'
import { pageFor } from '@/lib/pages'
import { iphoneAppTitle, type MenuHref, placeholderFor } from '@/lib/site-menus'

type FooterLink = MenuHref & { title: string }

const page = (path: Parameters<typeof pageFor>[0], title?: string): FooterLink => ({
  title: title ?? pageFor(path).title,
  href: path
})

export const footerColumns: readonly { heading: string; links: readonly FooterLink[] }[] = [
  {
    heading: 'Products',
    links: [
      { title: iphoneAppTitle, ...placeholderFor('iphone-app') },
      page('/dictionary/', 'Dictionary')
    ]
  },
  {
    heading: 'Tools',
    links: [
      { title: 'Kana charts', href: kanaChartsPath },
      { title: 'Kanji lists', href: kanjiListsPath },
      { title: 'Frequency lists', href: frequencyDictionariesPath },
      { title: 'All tools', ...placeholderFor('tools') }
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
