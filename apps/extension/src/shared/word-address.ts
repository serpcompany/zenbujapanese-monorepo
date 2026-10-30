import { type LinkedWord, wordPath } from '@zenbu/dictionary-core/detail/word-path'
import { websiteOrigin } from './hosts'

export const wordAddress = (word: LinkedWord) => `${websiteOrigin}${encodeURI(wordPath(word))}`
