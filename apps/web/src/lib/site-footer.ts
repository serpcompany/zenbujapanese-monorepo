import {
  frequencyDictionariesPath,
  kanaChartsPath,
  kanjiListsPath
} from '@/lib/dictionary/browse/paths'
import { type LinkTo, linkTo } from '@/lib/site'
import { iphoneAppTitle, pageLinkTo } from '@/lib/site-menus'

type FooterLink = LinkTo & { title: string }

export const footerColumns: readonly {
  heading: string
  links: readonly FooterLink[]
  account?: true
}[] = [
  {
    heading: 'Products',
    links: [
      { title: iphoneAppTitle, ...linkTo('iphone-app') },
      pageLinkTo('/dictionary/', 'Dictionary')
    ],
    account: true
  },
  {
    heading: 'Tools',
    links: [
      { title: 'Kana charts', href: kanaChartsPath },
      { title: 'Kanji lists', href: kanjiListsPath },
      { title: 'Frequency lists', href: frequencyDictionariesPath },
      { title: 'All tools', ...linkTo('tools') }
    ]
  },
  {
    heading: 'Company',
    links: [
      pageLinkTo('/about/'),
      pageLinkTo('/support/'),
      pageLinkTo('/contact/'),
      pageLinkTo('/sources/')
    ]
  },
  {
    heading: 'Legal',
    links: [
      pageLinkTo('/legal/privacy/'),
      pageLinkTo('/legal/terms/'),
      pageLinkTo('/legal/dmca/', 'DMCA'),
      pageLinkTo('/legal/affiliate-disclosure/')
    ]
  }
]
