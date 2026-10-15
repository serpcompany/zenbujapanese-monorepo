import { expect, test } from 'vitest'
import { repositoryFiles } from './files'
import { findXCUITestWaits } from './waits'

const uiTest = 'apps/ios/UITests/ExampleUITests.swift'
const source = (text: string) => () => text

test("finds each of XCUITest's own waits in a UI test, with its line", () => {
  const text = [
    'let page = find("word-detail.screen", in: app)',
    '_ = page.waitForExistence(timeout: 30)',
    'let shown = XCTNSPredicateExpectation(predicate: open, object: page)',
    'waitForExpectations(timeout: Self.patience)',
    'XCTWaiter().wait(for: [shown], timeout: 5)'
  ].join('\n')
  expect(findXCUITestWaits([uiTest], source(text))).toEqual([
    { path: uiTest, line: 2, wait: 'waitForExistence' },
    { path: uiTest, line: 3, wait: 'XCTNSPredicateExpectation' },
    { path: uiTest, line: 4, wait: 'waitForExpectations' },
    { path: uiTest, line: 5, wait: 'XCTWaiter' }
  ])
})

test('passes the helpers that look at once', () => {
  const text = 'waitFor(page)\nwaitUntil(page, "exists == true")\n_ = appears(page, within: 30)'
  expect(findXCUITestWaits([uiTest], source(text))).toEqual([])
})

test('leaves files outside the UI tests alone', () => {
  const packageTest = 'apps/ios/Modules/Tests/SearchExperienceTests/HeldAnswersTests.swift'
  expect(findXCUITestWaits([packageTest], source('_ = page.waitForExistence(timeout: 1)'))).toEqual(
    []
  )
})

test("no UI test in the repository calls XCUITest's own waits", () => {
  expect(findXCUITestWaits(repositoryFiles())).toEqual([])
})
