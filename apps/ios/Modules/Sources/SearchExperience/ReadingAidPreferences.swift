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

  var showsFurigana = true {
    didSet { persist() }
  }
  var showsRomaji = false {
    didSet { persist() }
  }
  /// A short English meaning under each linked word, separate from any sentence translation.
  var showsWordMeanings = false {
    didSet { persist() }
  }
  /// A natural translation under each Japanese sentence, separate from word meanings.
  var showsTranslations = true {
    didSet { persist() }
  }
  /// The language sentence translations are shown in. Only English is offered so far.
  var translationLanguage = TranslationLanguage.english {
    didSet { persist() }
  }
  /// Who translates Player captions.
  var translationSource = TranslationSource.youTube {
    didSet { persist() }
  }
  /// Furigana only over words the learner hasn't marked known.
  var hidesFuriganaOnKnownWords = false {
    didSet { persist() }
  }

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    guard
      let data = defaults.data(forKey: Self.storageKey),
      let stored = try? JSONDecoder().decode(StoredPreferences.self, from: data)
    else { return }
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
    defaults.set(data, forKey: Self.storageKey)
  }
}

/// A language sentence translations can be shown in.
enum TranslationLanguage: String, CaseIterable, Identifiable, Sendable {
  case english = "en"

  var id: String { rawValue }
  var name: String {
    Locale.current.localizedString(forLanguageCode: rawValue) ?? rawValue
  }
}

/// Who translates Player captions.
enum TranslationSource: String, CaseIterable, Identifiable, Sendable {
  /// YouTube's translation of the captions, with Apple Translation filling lines it leaves out.
  case youTube
  /// Apple Translation on the device, line by line, so each translation matches its line.
  case apple

  var id: String { rawValue }
  var name: String {
    switch self {
    case .youTube: "YouTube"
    case .apple: "Apple (On Device)"
    }
  }
}
