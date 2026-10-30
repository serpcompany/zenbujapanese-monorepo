import { fill } from '@zenbu/dictionary-core/detail/template'
import type { WordDetail } from '@zenbu/dictionary-core/detail/word'
import { Button } from '@zenbu/ui/components/button'
import { SavedItemActions } from '@zenbu/ui/dictionary/saved-item-actions'
import { ExternalLinkIcon, LinkIcon } from 'lucide-react'
import { wordAddress } from '../shared/word-address'
import { wordDetailLabels } from './labels'
import { copyText } from './notice'

const closedShareSheet = () => undefined

export function WordShare({ word }: { word: WordDetail }) {
  const labels = wordDetailLabels.share
  const url = wordAddress(word)
  const copyLink = () => void copyText(url, labels.linkCopied)
  const share = () => {
    if (!navigator.share) return copyLink()
    navigator.share({ title: word.headword, text: word.shareText, url }).catch(closedShareSheet)
  }
  return (
    <SavedItemActions
      share={{ label: fill(labels.share, { name: word.headword }), onSelect: share }}
      moreActions={fill(labels.moreActions, { name: word.headword })}
      groups={[[{ id: 'copyLink', icon: LinkIcon, label: labels.copyLink, onSelect: copyLink }]]}
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
