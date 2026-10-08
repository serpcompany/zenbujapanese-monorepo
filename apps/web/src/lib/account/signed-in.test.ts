import { expect, test } from 'vitest'
import { initialsOf } from './signed-in'

test.each([
  ['Kana Fan', 'kana@example.com', 'KF'],
  ['  mika   k. ', 'mika@example.com', 'MK'],
  ['Ada Lovelace Byron', 'ada@example.com', 'AL'],
  ['山田太郎', 'taro@example.com', '山'],
  ['', 'kana@example.com', 'K'],
  ['𠮷田 花子', 'h@example.com', '𠮷花']
])('the account button shows %j (%s) as %s', (name, email, initials) => {
  expect(initialsOf(name, email)).toBe(initials)
})
