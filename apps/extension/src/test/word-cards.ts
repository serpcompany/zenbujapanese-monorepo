import type { WordCard } from '@zenbu/dictionary-core/cards/card'
import type { SegmentedToken } from '@zenbu/dictionary-core/cards/segmentation'
import type { NotReady, PopupAnswer, SegmentAnswer } from '../shared/answers'
import { wordPopupLabels } from '../word-popup/labels'
import { find } from './render'

export const openFullEntryButton = (scope: ParentNode) =>
  find(scope, `button[aria-label="${wordPopupLabels.openFullEntry}"]`)

type Named = Pick<WordCard, 'entSeq' | 'headword' | 'reading'> & Partial<WordCard>

function wordCard(fields: Named): WordCard {
  return {
    languageReferenceID: `word-${fields.entSeq}`,
    furigana: [{ base: fields.headword, reading: fields.reading }],
    pitch: null,
    partOfSpeech: 'Noun',
    meanings: [{ meaning: 'meaning', notes: [], partsOfSpeech: ['Noun'] }],
    jlpt: null,
    frequency: [],
    ...fields
  }
}

export const youkyuu = wordCard({
  languageReferenceID: 'youkyuu',
  entSeq: 1546680,
  headword: '要求',
  reading: 'ようきゅう',
  meanings: [
    { meaning: 'demand, request', notes: [], partsOfSpeech: ['Noun'] },
    { meaning: 'requirement', notes: [], partsOfSpeech: ['Noun'] }
  ]
})

const iru = wordCard({
  languageReferenceID: 'iru',
  entSeq: 1546640,
  headword: '要る',
  reading: 'いる',
  partOfSpeech: 'Godan verb',
  meanings: [{ meaning: 'to be needed', notes: [], partsOfSpeech: ['Godan verb'] }]
})

const kaname = wordCard({
  languageReferenceID: 'kaname',
  entSeq: 1609600,
  headword: '要',
  reading: 'かなめ',
  meanings: [{ meaning: 'pivot', notes: [], partsOfSpeech: ['Noun'] }]
})

const you = wordCard({
  languageReferenceID: 'you',
  entSeq: 2188720,
  headword: '要',
  reading: 'よう',
  meanings: [{ meaning: 'main point', notes: [], partsOfSpeech: ['Noun'] }]
})

const cards = new Map([youkyuu, iru, kaname, you].map(card => [card.languageReferenceID, card]))

export const popupAnswer = (languageReferenceID: string): PopupAnswer => {
  const card = cards.get(languageReferenceID)
  return { type: 'popup', card: card ? { card, romaji: null } : null }
}

export const sentenceTokens: SegmentedToken[] = [
  { text: '要求', reading: 'ヨウキュウ', languageReferenceID: 'youkyuu' },
  { text: 'が', reading: 'ガ' },
  { text: '要る', reading: 'イル', languageReferenceID: 'iru' },
  { text: '。' }
]

export const sentence = '要求が要る。'

export const sentenceAnswer: SegmentAnswer = {
  type: 'segment',
  tokens: sentenceTokens,
  romaji: 'youkyuu ga iru.'
}

export const notReady: NotReady = {
  type: 'not-ready',
  data: { state: 'downloading', done: 0, total: 1 }
}
