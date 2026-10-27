import { describe, expect, it } from 'vitest'
import { settingDefaults } from '../shared/settings'
import { chosenWith, frequencyRows, moved } from './frequency-order'

const jlpt = 'zenbu.jlpt.waller.levels'
const youtube = 'zenbu.tubelex.youtube.ja.unidic-3.1'

const names = (settings: typeof settingDefaults) =>
  frequencyRows(settings).map(row => row.dictionary.name)

describe('frequency order', () => {
  it('lists JLPT Levels, then YouTube, both chosen, at first', () => {
    expect(names(settingDefaults)).toEqual(['JLPT Levels', 'YouTube'])
    expect(frequencyRows(settingDefaults).every(row => row.chosen)).toBe(true)
  })

  it('moves YouTube above JLPT Levels in both the order and the chosen list', () => {
    const choice = moved(settingDefaults, youtube, -1)
    expect(choice).toEqual({
      'frequencyDictionaries.order': [youtube, jlpt],
      'frequencyDictionaries.chosen': [youtube, jlpt]
    })
    expect(names({ ...settingDefaults, ...choice })).toEqual(['YouTube', 'JLPT Levels'])
  })

  it('moves nothing past either end', () => {
    expect(moved(settingDefaults, jlpt, -1)['frequencyDictionaries.order']).toEqual([jlpt, youtube])
    expect(moved(settingDefaults, youtube, 1)['frequencyDictionaries.order']).toEqual([
      jlpt,
      youtube
    ])
  })

  it('keeps a dictionary that is turned off in its place, out of the chosen list', () => {
    const off = chosenWith(settingDefaults, jlpt, false)
    expect(off).toEqual({
      'frequencyDictionaries.order': [jlpt, youtube],
      'frequencyDictionaries.chosen': [youtube]
    })
    const movedWhileOff = moved({ ...settingDefaults, ...off }, youtube, -1)
    expect(movedWhileOff['frequencyDictionaries.chosen']).toEqual([youtube])
    const back = chosenWith({ ...settingDefaults, ...movedWhileOff }, jlpt, true)
    expect(back['frequencyDictionaries.chosen']).toEqual([youtube, jlpt])
  })

  it('puts a pack the order does not name last', () => {
    const settings = { ...settingDefaults, 'frequencyDictionaries.order': [youtube] }
    expect(names(settings)).toEqual(['YouTube', 'JLPT Levels'])
  })
})
