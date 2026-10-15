import { expect, test } from 'vitest'
import { repositoryFiles } from './files'
import { findUITestWaits } from './waits'

const uiTest = 'apps/ios/UITests/ExampleUITests.swift'
const source = (text: string) => () => text
const pause = 'RunLoop.current.run(until: Date.now.addingTimeInterval(2))'

test.each([
  ['_ = page.waitForExistence(timeout: 30)', 'waitForExistence'],
  ['_ = page.waitForNonExistence(timeout: 30)', 'waitForNonExistence'],
  [
    'let shown = XCTNSPredicateExpectation(predicate: open, object: page)',
    'XCTNSPredicateExpectation'
  ],
  ['waitForExpectations(timeout: Self.patience)', 'waitForExpectations'],
  ['XCTWaiter().wait(for: [shown], timeout: 5)', 'XCTWaiter']
])("finds XCUITest's own wait in %s, with its line", (call, wait) => {
  const text = `let page = find("word-detail.screen", in: app)\n${call}`
  expect(findUITestWaits([uiTest], source(text), {})).toEqual([
    { path: uiTest, line: 2, problem: `calls ${wait}` }
  ])
})

test.each([
  'RunLoop.current.run(until: Date.now.addingTimeInterval(2))',
  'RunLoop.main.run(until: Date().addingTimeInterval(2))',
  'RunLoop.current.run(until: Date(timeIntervalSinceNow: 2))',
  'RunLoop.main.run(until: settled)',
  'Thread.sleep(forTimeInterval: 1)',
  'try await Task.sleep(for: .seconds(1))',
  'try await Task.sleep(nanoseconds: 1_000_000_000)',
  'sleep(1)',
  'usleep(500)'
])('refuses the fixed pause %s when no allowance names it', pauseCall => {
  const text = `tap(button)\n${pauseCall}`
  expect(findUITestWaits([uiTest], source(text), {}).map(problem => problem.line)).toEqual([2])
})

test('passes the helpers that look at once', () => {
  const text = 'waitFor(page)\nwaitUntil(page, "exists == true")\n_ = appears(page, within: 30)'
  expect(findUITestWaits([uiTest], source(text), {})).toEqual([])
})

test('passes the pauses an allowance names, and refuses one more', () => {
  const allowed = { [uiTest]: { pauses: 1, proves: 'the panel stays open' } }
  expect(findUITestWaits([uiTest], source(`tap(button)\n${pause}`), allowed)).toEqual([])
  expect(findUITestWaits([uiTest], source(`${pause}\n${pause}`), allowed)).toEqual([
    {
      path: uiTest,
      line: 1,
      problem: expect.stringMatching(
        /one of 2 pauses .* have 1 \(they prove the panel stays open\)/
      )
    },
    { path: uiTest, line: 2, problem: expect.stringMatching(/one of 2 pauses/) }
  ])
})

test('asks for an allowance to be lowered once its pauses are gone', () => {
  const allowed = { [uiTest]: { pauses: 1, proves: 'the panel stays open' } }
  expect(findUITestWaits([uiTest], source('waitFor(page)'), allowed)).toEqual([
    { path: uiTest, line: 1, problem: expect.stringMatching(/fewer than the 1 .*lower its entry/) }
  ])
})

test('leaves files outside the UI tests alone', () => {
  const packageTest = 'apps/ios/Modules/Tests/SearchExperienceTests/HeldAnswersTests.swift'
  const text = `_ = page.waitForExistence(timeout: 1)\n${pause}`
  expect(findUITestWaits([packageTest], source(text), {})).toEqual([])
})

test("no UI test in the repository calls XCUITest's own waits or pauses beyond its allowance", () => {
  expect(findUITestWaits(repositoryFiles())).toEqual([])
})
