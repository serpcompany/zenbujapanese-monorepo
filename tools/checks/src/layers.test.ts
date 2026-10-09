import { expect, test } from 'vitest'
import { repositoryFiles } from './files'
import { checkLayers, swiftLayers, swiftPlatforms } from './layers'

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

const feature = 'apps/ios/Modules/Sources/SearchExperience/SearchView.swift'
const adapters = 'apps/ios/Modules/Sources/SearchExperience/Platform/PlatformModifiers.swift'

test('keeps platform conditions and UIKit in the Platform folder', () => {
  const text = '#if os(macOS)\n  import AppKit\n#elseif canImport(UIKit)\n  import UIKit\n#endif\n'
  expect(checkLayers([adapters], swiftLayers, source(text))).toEqual([])
  expect(checkLayers([feature], swiftLayers, source(text)).map(problem => problem.line)).toEqual([
    1, 2, 3, 4
  ])
})

test('names the adapter to use for an iPhone-only modifier', () => {
  const problems = checkLayers(
    [feature],
    swiftLayers,
    source('    .navigationBarTitleDisplayMode(.inline)\n    .keyboardType(.emailAddress)\n')
  )
  expect(problems).toEqual([
    { path: feature, line: 1, problem: expect.stringMatching(/use \.inlineNavigationTitle\(\)$/) },
    { path: feature, line: 2, problem: expect.stringMatching(/use \.textEntry\(_:\)$/) }
  ])
})

test('refuses UIKit and AppKit types that SwiftUI reaches without an import', () => {
  const problems = checkLayers(
    [feature],
    swiftLayers,
    source(
      'let color = Color(uiColor: UIColor.red)\nlet image = NSImage(data: data)\nlet font = NSFont.systemFont(ofSize: 12)\nlet range = NSRange(location: 0, length: 1)\n'
    )
  )
  expect(problems.map(problem => problem.line)).toEqual([1, 2, 3])
})

test('allows the adapters by name and conditions that are not about the platform', () => {
  const text =
    '#if DEBUG\n.inlineNavigationTitle()\n@State private var editMode = ListEditMode.inactive\n#endif\n'
  expect(checkLayers([feature], swiftLayers, source(text))).toEqual([])
})

test('checks the app target as well as the package', () => {
  const app = 'apps/ios/App/ZenbuJapaneseApp.swift'
  expect(checkLayers([app], swiftLayers, source('#if os(iOS)\n#endif\n'))).toHaveLength(1)
})

test('checks the real app sources', () => {
  const sources = repositoryFiles().filter(
    path =>
      path.endsWith('.swift') &&
      (path.startsWith('apps/ios/Modules/Sources/') || path.startsWith('apps/ios/App/'))
  )
  expect(sources.some(path => path.startsWith(swiftPlatforms.adapters))).toBe(true)
  expect(checkLayers(sources)).toEqual([])
})
