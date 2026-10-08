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
  test.each([
    ['the frequency card', frequencyPreview.word],
    ['the search preview’s first result', searchPreview.results[0]]
  ])('%s', (_, shown) => {
    expect(taberu).toBeDefined()
    expect({ ruby: shown.ruby, meaning: shown.meaning, chips: shown.chips }).toEqual({
      ruby: taberu?.ruby,
      meaning: taberu?.summary,
      chips: taberu?.chips
    })
  })
})
