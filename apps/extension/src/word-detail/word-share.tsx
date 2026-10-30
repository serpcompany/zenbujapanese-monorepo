import { fill } from '@zenbu/dictionary-core/detail/template'
import type { WordDetail } from '@zenbu/dictionary-core/detail/word'
import { wordPath } from '@zenbu/dictionary-core/detail/word-path'
import { SavedItemActions } from '@zenbu/ui/dictionary/saved-item-actions'
import { LinkIcon } from 'lucide-react'
import { websiteOrigin } from '../shared/hosts'
import { wordDetailLabels } from './labels'
import { useNotices } from './notice'

const closedShareSheet = () => undefined

export function WordShare({ word }: { word: WordDetail }) {
  const labels = wordDetailLabels.share
  const { copy } = useNotices()
  const url = `${websiteOrigin}${encodeURI(wordPath(word))}`
  const copyLink = () => void copy(url, labels.linkCopied)
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
