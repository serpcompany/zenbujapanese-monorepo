import type { FrequencyResult } from '@zenbu/dictionary-core/detail/frequency'
import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'
import { fixtureBrowseAnswers } from '@zenbu/dictionary-core/fixtures'
import { describe, expect, test } from 'vitest'
import { frequencyPreview, searchPreview } from './home-previews'

interface BrowseWord {
  headword: string
  ruby: RubySegment[]
  summary: string
  chips: FrequencyResult[]
}

const ichidanVerbs = fixtureBrowseAnswers['/v1/browse/categories/ichidan-verbs?page=1'] as {
  words: BrowseWord[]
}

const taberu = ichidanVerbs.words.find(word => word.headword === '食べる')

describe('the homepage draws 食べる as the dictionary has it', () => {
  test('in the frequency card and the search preview’s first result', () => {
    expect(searchPreview.results[0]).toBe(frequencyPreview.word)
    expect({
      ruby: frequencyPreview.word.ruby,
      meaning: frequencyPreview.word.meaning,
      chips: frequencyPreview.word.chips
    }).toEqual({ ruby: taberu?.ruby, meaning: taberu?.summary, chips: taberu?.chips })
  })

  test('in the search preview’s word card', () => {
    const { ruby, meanings } = searchPreview.open
    expect({ ruby, meaning: meanings[0] }).toEqual({ ruby: taberu?.ruby, meaning: taberu?.summary })
  })
})
