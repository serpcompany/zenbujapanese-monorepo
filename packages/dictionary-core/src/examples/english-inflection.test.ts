import { describe, expect, test } from 'vitest'
import { sameWordInAnyForm } from './english-inflection'

const eitherWay = (one: string, other: string) => [
  sameWordInAnyForm(one)(other),
  sameWordInAnyForm(other)(one)
]

describe('sameWordInAnyForm', () => {
  test.each([
    ['cats', 'cat'],
    ['likes', 'like'],
    ['watches', 'watch'],
    ['boxes', 'box'],
    ['glasses', 'glass'],
    ['goes', 'go'],
    ['studies', 'study'],
    ['ties', 'tie']
  ])('reads the plural or third person %s as %s', (inflected, base) => {
    expect(eitherWay(inflected, base)).toEqual([true, true])
  })

  test.each([
    ['breathes', 'breath'],
    ['clothes', 'cloth']
  ])('reads %s as no form of %s: es follows only a hissing sound or an o', (one, other) => {
    expect(eitherWay(one, other)).toEqual([false, false])
  })

  test.each([
    ['walked', 'walk'],
    ['startled', 'startle'],
    ['apologized', 'apologize'],
    ['studied', 'study'],
    ['tied', 'tie'],
    ['skied', 'ski'],
    ['stopped', 'stop'],
    ['agreed', 'agree']
  ])('reads the past %s as %s', (inflected, base) => {
    expect(eitherWay(inflected, base)).toEqual([true, true])
  })

  test.each([
    ['walking', 'walk'],
    ['startling', 'startle'],
    ['making', 'make'],
    ['running', 'run'],
    ['studying', 'study'],
    ['being', 'be']
  ])('reads %s, ending in ing, as %s', (inflected, base) => {
    expect(eitherWay(inflected, base)).toEqual([true, true])
  })

  test.each([
    ['startled', 'startling'],
    ['startles', 'startled'],
    ['missing', 'missed'],
    ['studies', 'studying'],
    ['tries', 'tried'],
    ['stopped', 'stops'],
    ['making', 'makes']
  ])('reads %s and %s as two forms of one word', (one, other) => {
    expect(eitherWay(one, other)).toEqual([true, true])
  })

  test.each([
    ['Startle', 'startle'],
    ['YOU', 'you'],
    ['_', '_'],
    ['11111011111', '11111011111']
  ])('reads %s and %s, equal but for case, as one word', (one, other) => {
    expect(eitherWay(one, other)).toEqual([true, true])
  })

  test.each([
    ['generously', 'generally'],
    ['generously', 'generous'],
    ['animating', 'animals'],
    ['grate', 'grateful'],
    ['privations', 'private'],
    ['lateral', 'later'],
    ['importers', 'important'],
    ['communes', 'communications'],
    ['probabilities', 'probably'],
    ['experimented', 'experience']
  ])('reads %s and %s, which only share a stem, as two words', (one, other) => {
    expect(eitherWay(one, other)).toEqual([false, false])
  })

  test.each([
    ['1111111', '11111011111'],
    ['1000000', '100000'],
    ['1990s', '1990'],
    ['mp3s', 'mp3'],
    ['as', 'a'],
    ['is', 'i']
  ])('gives %s no other form, so it is not %s: only letters, three or more, inflect', (one, other) => {
    expect(eitherWay(one, other)).toEqual([false, false])
  })

  test.each([
    ['bed', 'be'],
    ['red', 're'],
    ['king', 'k'],
    ['thing', 'th']
  ])('reads %s as no past or ing form of %s: nothing with a vowel is left', (one, other) => {
    expect(eitherWay(one, other)).toEqual([false, false])
  })

  test.each([
    ['tos', 'to'],
    ['mes', 'me'],
    ['tvs', 'tv'],
    ['uses', 'us'],
    ['used', 'us'],
    ['offing', 'of'],
    ['inning', 'in']
  ])('reads %s as no form of %s: a base has three letters, or two as go has', (one, other) => {
    expect(eitherWay(one, other)).toEqual([false, false])
  })
})
