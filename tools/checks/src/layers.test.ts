import { expect, test } from 'vitest'
import { checkLayers, swiftLayers } from './layers'

const core = 'apps/ios/Modules/Sources/TranslatorCore/LiveConversation.swift'
const app = 'apps/ios/Modules/Sources/SearchExperience/Translate/LiveConversationView.swift'
const source = (text: string) => () => text

test('passes the imports a layer allows', () => {
  expect(
    checkLayers([core], swiftLayers, source('import Foundation\nimport Observation\n'))
  ).toEqual([])
})

test('refuses a framework the layer leaves to the app, with its line', () => {
  expect(
    checkLayers(
      [core],
      swiftLayers,
      source('import Foundation\n@preconcurrency import AVFoundation\n')
    )
  ).toEqual([
    {
      path: core,
      line: 2,
      problem: expect.stringMatching(/imports AVFoundation; .*may import only Foundation/)
    }
  ])
})

test('catches access-level and kind-scoped imports', () => {
  const problems = checkLayers(
    [core],
    swiftLayers,
    source('public import SwiftUI\nimport struct SearchExperience.SearchQuery\n')
  )
  expect(problems.map(problem => problem.line)).toEqual([1, 2])
})

test('leaves files outside a layer alone', () => {
  expect(checkLayers([app], swiftLayers, source('import SwiftUI\n'))).toEqual([])
})

test('checks the real TranslatorCore sources', () => {
  expect(checkLayers([core])).toEqual([])
})

test('keeps the on-device adapters free of the app and its screens', () => {
  const onDevice = 'apps/ios/Modules/Sources/TranslatorOnDevice/BilingualRecognizer.swift'
  const problems = checkLayers(
    [onDevice],
    swiftLayers,
    source('import Speech\nimport TranslatorCore\nimport SwiftUI\nimport SearchExperience\n')
  )
  expect(problems.map(problem => problem.line)).toEqual([3, 4])
  expect(checkLayers([onDevice])).toEqual([])
})
