import Foundation
import Observation

@MainActor
@Observable
final class ReadingAidPreferences {
  private struct StoredPreferences: Codable {
    let showsFurigana: Bool
    let showsRomaji: Bool
    let showsWordMeanings: Bool?
    let showsKanjiMeanings: Bool?
    let showsTranslations: Bool?
    let translationLanguage: String?
    let hidesFuriganaOnKnownWords: Bool?
    let translationSource: String?
  }

  private static let storageKey = "reading-aids.preferences.v1"
  private let defaults: UserDefaults
  private let storageKey: String
  @ObservationIgnored private var observer: NSObjectProtocol?
  @ObservationIgnored private var isTaking = false

  var showsFurigana = true {
    didSet { persist() }
  }
  var showsRomaji = false {
    didSet { persist() }
  }
  var showsWordMeanings = false {
    didSet { persist() }
  }
  var showsKanjiMeanings = true {
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
  var showsFuriganaOnKnownWords: Bool {
    get { !hidesFuriganaOnKnownWords }
    set { hidesFuriganaOnKnownWords = !newValue }
  }

  init(
    defaults: UserDefaults = .standard, storageKey: String = ReadingAidPreferences.storageKey,
    furiganaByDefault: Bool = true
  ) {
    self.defaults = defaults
    self.storageKey = storageKey
    observer = NotificationCenter.default.addObserver(
      forName: UserDefaults.didChangeNotification, object: defaults, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated { self?.takeStored() }
    }
    guard let stored else {
      if !furiganaByDefault { showsFurigana = false }
      return
    }
    take(stored)
  }

  private var stored: StoredPreferences? {
    defaults.data(forKey: storageKey).flatMap {
      try? JSONDecoder().decode(StoredPreferences.self, from: $0)
    }
  }

  private func takeStored() {
    if let stored { take(stored) }
  }

  private func take(_ stored: StoredPreferences) {
    func set<Value: Equatable>(_ path: ReferenceWritableKeyPath<ReadingAidPreferences, Value>, _ value: Value) {
      if self[keyPath: path] != value { self[keyPath: path] = value }
    }
    isTaking = true
    defer { isTaking = false }
    set(\.showsFurigana, stored.showsFurigana)
    set(\.showsRomaji, stored.showsRomaji)
    set(\.showsWordMeanings, stored.showsWordMeanings ?? false)
    set(\.showsKanjiMeanings, stored.showsKanjiMeanings ?? true)
    set(\.showsTranslations, stored.showsTranslations ?? true)
    set(
      \.translationLanguage,
      stored.translationLanguage.flatMap(TranslationLanguage.init(rawValue:)) ?? .english)
    set(\.hidesFuriganaOnKnownWords, stored.hidesFuriganaOnKnownWords ?? false)
    set(
      \.translationSource,
      stored.translationSource.flatMap(TranslationSource.init(rawValue:)) ?? .youTube)
  }

  private func persist() {
    guard !isTaking else { return }
    let stored = StoredPreferences(
      showsFurigana: showsFurigana,
      showsRomaji: showsRomaji,
      showsWordMeanings: showsWordMeanings,
      showsKanjiMeanings: showsKanjiMeanings,
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
