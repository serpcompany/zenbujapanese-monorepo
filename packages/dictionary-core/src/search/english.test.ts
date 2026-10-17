import { describe, expect, test } from 'vitest'
import { glossRelation, glossToken } from './english'
import { GlossRelation } from './rank'

describe('glossRelation', () => {
  test.each([
    ['dog', 'dog (Canis (lupus) familiaris)', GlossRelation.qualifiedGloss],
    ['dog', 'dog', GlossRelation.exactGloss],
    ['see', 'to see (a doctor)', GlossRelation.qualifiedInfinitive],
    ['to', 'to (take out and) show', GlossRelation.glossToken],
    ['to', 'to (nearly) drown', GlossRelation.glossToken],
    ['dog', 'dog (pejorative) days', GlossRelation.glossToken],
    ['soft', 'soft (and fluffy) (e.g. bed, bread, baked potato)', GlossRelation.qualifiedGloss],
    ['tamagotchi', 'tamagotchi (handheld digital pet) (trademark)', GlossRelation.qualifiedGloss],
    ['dog', 'dog (a) days (b)', GlossRelation.glossToken]
  ])('counts %s in "%s" as the query only when its note ends the meaning', (query, gloss, relation) => {
    expect(glossRelation(query, gloss, glossToken(query))).toBe(relation)
  })
})
