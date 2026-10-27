import Foundation
import Testing
@testable import SearchExperience

@MainActor
@Suite("Synced settings, against the cases the account service shares")
struct SharedSettingsRulesTests {
  private struct SharedSetting: Decodable {
    let name: String
    let kind: String
    let choices: [String]?
    let least: Double?
    let most: Double?
    let pattern: String?
    let accepted: [SyncFieldValue]
    let refused: [SyncFieldValue]

    func takes(_ value: SyncFieldValue) -> Bool {
      switch (kind, value) {
      case ("boolean", .bool): return true
      case ("choice", .string(let text)): return choices?.contains(text) ?? false
      case ("number", .decimal(let number)): return within(number)
      case ("number", .number(let number)): return within(Double(number))
      case ("text", .string(let text)):
        guard let pattern, let most, Double(text.utf16.count) <= most,
          let expression = try? NSRegularExpression(pattern: pattern)
        else { return false }
        return expression.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
      default: return false
      }
    }

    private func within(_ number: Double) -> Bool {
      guard let least, let most else { return false }
      return number >= least && number <= most
    }
  }

  private func shared() throws -> [String: SharedSetting] {
    struct File: Decodable { let settings: [SharedSetting] }
    let file = try SharedAccountCases.load("settings", as: File.self)
    return Dictionary(uniqueKeysWithValues: file.settings.map { ($0.name, $0) })
  }

  @Test("the cases read each kind as the account service does")
  func casesReadAsTheServiceDoes() throws {
    for setting in try shared().values {
      for value in setting.accepted { #expect(setting.takes(value), "\(setting.name) \(value)") }
      for value in setting.refused { #expect(!setting.takes(value), "\(setting.name) \(value)") }
    }
  }

  @Test("every setting the app syncs is one the account lists, and its standard value one it takes")
  func standardValues() throws {
    let settings = try shared()
    for setting in SyncedSetting.all {
      let listed = try #require(settings[setting.name], "\(setting.name)")
      #expect(listed.takes(setting.standard), "\(setting.name)")
    }
  }

  @Test("every value the app's own choices can write is one the account takes")
  func choices() throws {
    let settings = try shared()
    let written: [(String, [SyncFieldValue])] = [
      ("imageSearch.textView", ImageTextViewMode.allCases.map { .string($0.rawValue) }),
      ("readingAids.translationSource", TranslationSource.allCases.map { .string($0.rawValue) }),
      ("readingAids.translationLanguage", TranslationLanguage.allCases.map { .string($0.rawValue) }),
      (
        "translate.speechSpeed",
        [TranslateExperience.speechSpeeds.lowerBound, TranslateExperience.speechSpeeds.upperBound]
          .map { .decimal($0) }
      ),
    ]
    for (name, values) in written {
      let listed = try #require(settings[name], "\(name)")
      for value in values { #expect(listed.takes(value), "\(name) \(value)") }
    }
  }
}
