import Foundation
import Observation

@MainActor
@Observable
final class ReadingAidPreferences {
  private struct StoredPreferences: Codable {
    let showsFurigana: Bool
    let showsRomaji: Bool
    let showsWordMeanings: Bool?
    let showsTranslations: Bool?
    let translationLanguage: String?
    let hidesFuriganaOnKnownWords: Bool?
    let translationSource: String?
  }

  private static let storageKey = "reading-aids.preferences.v1"
  private let defaults: UserDefaults
  private let storageKey: String

  var showsFurigana = true {
    didSet { persist() }
  }
  var showsRomaji = false {
    didSet { persist() }
  }
  var showsWordMeanings = false {
    didSet { persist() }
  }
  var showsTranslations = true {
    didSet { persist() }
  }
  var translationLanguage = TranslationLanguage.english {
    didSet { persist() }
  }
  var translationSource = TranslationSource.youTube {
    didSet { persist() }
  }
  var hidesFuriganaOnKnownWords = false {
    didSet { persist() }
  }

  init(
    defaults: UserDefaults = .standard, storageKey: String = ReadingAidPreferences.storageKey,
    furiganaByDefault: Bool = true
  ) {
    self.defaults = defaults
    self.storageKey = storageKey
    guard
      let data = defaults.data(forKey: storageKey),
      let stored = try? JSONDecoder().decode(StoredPreferences.self, from: data)
    else {
      if !furiganaByDefault { showsFurigana = false }
      return
    }
    showsFurigana = stored.showsFurigana
    showsRomaji = stored.showsRomaji
    showsWordMeanings = stored.showsWordMeanings ?? false
    showsTranslations = stored.showsTranslations ?? true
    translationLanguage =
      stored.translationLanguage.flatMap(TranslationLanguage.init(rawValue:)) ?? .english
    hidesFuriganaOnKnownWords = stored.hidesFuriganaOnKnownWords ?? false
    translationSource =
      stored.translationSource.flatMap(TranslationSource.init(rawValue:)) ?? .youTube
  }

  private func persist() {
    let stored = StoredPreferences(
      showsFurigana: showsFurigana,
      showsRomaji: showsRomaji,
      showsWordMeanings: showsWordMeanings,
      showsTranslations: showsTranslations,
      translationLanguage: translationLanguage.rawValue,
      hidesFuriganaOnKnownWords: hidesFuriganaOnKnownWords,
      translationSource: translationSource.rawValue
    )
    guard let data = try? JSONEncoder().encode(stored) else { return }
    defaults.set(data, forKey: storageKey)
  }
}

enum TranslationLanguage: String, CaseIterable, Identifiable, Sendable {
  case english = "en"

  var id: String { rawValue }
  var name: String {
    Locale.current.localizedString(forLanguageCode: rawValue) ?? rawValue
  }
}

enum TranslationSource: String, CaseIterable, Identifiable, Sendable {
  case youTube
  case apple

  var id: String { rawValue }
  var name: String {
    switch self {
    case .youTube: "YouTube"
    case .apple: "Apple (On Device)"
    }
  }
}
