import { fill } from '@zenbu/dictionary-core/detail/template'
import type { WordDetail } from '@zenbu/dictionary-core/detail/word'
import { Button } from '@zenbu/ui/components/button'
import { ExternalLinkIcon } from 'lucide-react'
import { wordAddress } from '../shared/word-address'
import { WordMenu } from '../word-saving/word-menu'
import { wordDetailLabels } from './labels'
import { useNotices } from './notice'

const closedShareSheet = () => undefined

export function WordShare({ word, item }: { word: WordDetail; item: string }) {
  const labels = wordDetailLabels.share
  const { copy } = useNotices()
  const url = wordAddress(word)
  const share = () => {
    if (!navigator.share) return void copy(url, labels.linkCopied)
    navigator.share({ title: word.headword, text: word.shareText, url }).catch(closedShareSheet)
  }
  return (
    <WordMenu
      word={{ item, headword: word.headword, reading: word.reading }}
      share={{ label: fill(labels.share, { name: word.headword }), onSelect: share }}
      moreActions={fill(labels.moreActions, { name: word.headword })}
    />
  )
}

export function OpenOnWebsite({ word }: { word: WordDetail }) {
  const label = wordDetailLabels.share.openOnWebsite
  return (
    <Button
      variant="outline"
      size="icon"
      nativeButton={false}
      render={
        <a
          href={wordAddress(word)}
          target="_blank"
          rel="noreferrer"
          aria-label={label}
          title={label}
        >
          <ExternalLinkIcon />
        </a>
      }
    />
  )
}
