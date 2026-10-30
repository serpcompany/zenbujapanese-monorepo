import { describe, expect, it } from 'vitest'
import { settingDefaults } from '../../shared/settings'
import { Draft, freshMeta, type Item } from './kept'
import { reconcile } from './synced-settings'

const name = 'frequencyDictionaries.chosen'
const key = `setting:${name}`
const [first, second] = settingDefaults[name]
const third = 'zenbu.wikipedia.written.ja'

const pulled: Item = { entity: 'setting', entityId: name, version: 2, data: { name, value: third } }

function pullWaitingBehindAChange(refused: string | undefined) {
  const meta = freshMeta({ id: 'learner', email: 'learner@example.com' })
  meta.queue.push({
    mutation: {
      id: 'unsent',
      entity: 'setting',
      operation: 'set',
      entityId: name,
      baseVersion: 1,
      fields: { value: `${second}` }
    },
    sent: false,
    before: null
  })
  meta.deferred.push(pulled)
  if (refused !== undefined) meta.refused[name] = refused
  return new Draft(new Map(), meta)
}

const withChosen = (chosen: string[]) => ({ ...settingDefaults, [name]: chosen })

describe("reconciling the browser's settings with a pull that waited behind the learner's change", () => {
  it.each([
    ['holds a value the account cannot take', ['Not A Pack'], undefined],
    ['holds the value the account refused', [`${first}`], JSON.stringify(first)]
  ])("drops the change and takes the account's value when the browser %s", (_, chosen, refused) => {
    const draft = pullWaitingBehindAChange(refused)
    const writes = reconcile(draft, withChosen(chosen), () => 'new')
    expect(writes).toMatchObject({ [name]: [third] })
    expect(draft.get(key)).toEqual(pulled)
    expect(draft.meta).toMatchObject({ queue: [], deferred: [] })
  })

  it('sends the browser value in place of the change, and keeps the pull waiting, when the account refused another value', () => {
    const draft = pullWaitingBehindAChange(JSON.stringify(third))
    const writes = reconcile(draft, withChosen([`${first}`]), () => 'new')
    expect(writes).toEqual({})
    expect(draft.get(key)).toBeUndefined()
    expect(draft.meta?.refused).toEqual({})
    expect(draft.meta?.deferred).toEqual([pulled])
    expect(draft.meta?.queue.map(queued => queued.mutation)).toMatchObject([
      { id: 'unsent', fields: { value: first } }
    ])
  })
})
