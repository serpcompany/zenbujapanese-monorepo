import { describe, expect, test } from 'vitest'
import { type SettingKind, settingRules } from '../domain/settings'
import { appliedAt, type Learner, outcomesOf, useAccountService } from '../test/accounts'
import { SyncClient } from '../test/sync-client'

const accounts = useAccountService()

const set = (name: string, baseVersion: number, value: unknown) => ({
  entity: 'setting',
  operation: 'set',
  entityId: name,
  baseVersion,
  fields: { value }
})

const results = accounts.results
const changesOf = (learner: Learner) => accounts.changesOf(learner, 'setting')

const valid: Record<SettingKind['kind'], (kind: SettingKind) => unknown> = {
  boolean: () => true,
  choice: kind => (kind.kind === 'choice' ? kind.choices.at(-1) : null),
  number: kind => (kind.kind === 'number' ? kind.most : null),
  text: () => null
}
const validText: Record<string, string> = {
  'readingAids.translationLanguage': 'pt-BR',
  'search.sort': 'frequency|zenbu.jiten.anime',
  'frequencyDictionaries.chosen':
    'zenbu.jiten.anime.ja.ordered-v2,zenbu.wikipedia.written.ja.unidic-3.1'
}

describe('settings', () => {
  test('a set puts the value in the account, and setting it again changes nothing', async () => {
    const learner = await accounts.learner('setting-set@example.com')
    expect(
      await results(
        learner,
        set('readingAids.furigana', 0, false),
        set('readingAids.furigana', 1, false),
        set('readingAids.furigana', 0, false)
      )
    ).toMatchObject(appliedAt(1, 1, 1))
    expect(await changesOf(learner)).toEqual([
      {
        entity: 'setting',
        entityId: 'readingAids.furigana',
        operation: 'put',
        version: 1,
        data: { name: 'readingAids.furigana', value: false }
      }
    ])
  })

  test('a set at an older version conflicts with the value as it is, and settings change apart', async () => {
    const learner = await accounts.learner('setting-conflict@example.com')
    await results(learner, set('translate.speechSpeed', 0, 1.5), set('readingAids.romaji', 0, true))
    expect(
      await results(
        learner,
        set('translate.speechSpeed', 0, 0.8),
        set('readingAids.romaji', 1, false),
        set('search.filter', 3, 'known')
      )
    ).toMatchObject([
      {
        status: 'conflict',
        version: 1,
        current: { operation: 'put', data: { name: 'translate.speechSpeed', value: 1.5 } }
      },
      { status: 'applied', version: 2 },
      { status: 'conflict', version: 0, current: { operation: 'delete', data: null } }
    ])
  })

  test('takes every setting it lists, each at a value of its kind', async () => {
    const learner = await accounts.learner('setting-every@example.com')
    const names = Object.keys(settingRules)
    const answer = await results(
      learner,
      ...names.map(name => {
        const kind = settingRules[name]?.value as SettingKind
        return set(name, 0, validText[name] ?? valid[kind.kind](kind))
      })
    )
    expect(answer.map(result => result.status)).toEqual(names.map(() => 'applied'))
    expect(outcomesOf(await results(learner, set('frequencyDictionaries.chosen', 1, '')))).toEqual([
      'applied'
    ])
  })

  test('refuses a setting it does not know, a value out of its kind, and any other field', async () => {
    const learner = await accounts.learner('setting-refused@example.com')
    const answer = await results(
      learner,
      set('theme.dark', 0, true),
      set('toString', 0, true),
      set('readingAids.furigana', 0, 'yes'),
      set('translate.speechSpeed', 0, 2.5),
      set('translate.speechSpeed', 0, 0.4),
      set('search.filter', 0, 'starred'),
      set('search.sort', 0, 'frequency|Anime!'),
      set('readingAids.translationLanguage', 0, 'english language'),
      set('frequencyDictionaries.chosen', 0, 'one,,two'),
      { ...set('imageSearch.textView', 0, 'text'), fields: { value: 'text', also: 1 } },
      { ...set('imageSearch.textView', 0, 'text'), baseVersion: undefined }
    )
    expect(outcomesOf(answer)).toEqual([
      'unknown_setting',
      'unknown_setting',
      ...Array(8).fill('invalid_fields'),
      'invalid_mutation'
    ])
  })
})

test('two devices converge on settings: the first change to sync wins, and the other takes it', async () => {
  const learner = await accounts.learner('setting-converge@example.com')
  const phone = new SyncClient(accounts, learner.token)
  const mac = new SyncClient(accounts, learner.token)
  phone.change('setting', 'set', 'readingAids.furigana', { value: false })
  phone.change('setting', 'set', 'imageSearch.textView', { value: 'text' })
  await phone.sync()
  await mac.sync()

  mac.change('setting', 'set', 'imageSearch.textView', { value: 'photo' })
  phone.change('setting', 'set', 'imageSearch.textView', { value: 'translate' })
  phone.change('setting', 'set', 'translate.speechSpeed', { value: 0.7 })
  await mac.sync()
  await phone.sync()
  await mac.sync()

  expect(mac.state()).toEqual(phone.state())
  expect(phone.dataOf('setting', 'imageSearch.textView')).toMatchObject({ value: 'photo' })
  expect(mac.dataOf('setting', 'translate.speechSpeed')).toMatchObject({ value: 0.7 })
  const fresh = new SyncClient(accounts, learner.token)
  await fresh.sync()
  expect(fresh.state()).toEqual(phone.state())
})
