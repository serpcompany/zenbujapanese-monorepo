import Foundation

struct SyncedSetting: Sendable {
  let name: String
  let standard: SyncFieldValue
  let read: @Sendable (UserDefaults) -> SyncFieldValue?
  let write: @Sendable (UserDefaults, SyncFieldValue) -> Void

  static func plain(_ name: String, key: String, standard: SyncFieldValue) -> SyncedSetting {
    SyncedSetting(
      name: name, standard: standard,
      read: { defaults in
        switch defaults.object(forKey: key) {
        case let text as String: .string(text)
        case let number as Double: .decimal(number)
        default: nil
        }
      },
      write: { defaults, value in defaults.set(value.plainValue, forKey: key) })
  }

  static func readingAid(
    _ name: String, field: String, in key: String, standard: SyncFieldValue,
    furiganaStandard: Bool = true
  ) -> SyncedSetting {
    SyncedSetting(
      name: name, standard: standard,
      read: { defaults in
        guard let stored = blob(key, in: defaults) else { return nil }
        switch stored[field] {
        case let flag as Bool: return .bool(flag)
        case let text as String: return .string(text)
        default: return nil
        }
      },
      write: { defaults, value in
        var stored = blob(key, in: defaults) ?? [
          "showsFurigana": furiganaStandard, "showsRomaji": false,
        ]
        stored[field] = value.plainValue
        guard let data = try? JSONSerialization.data(withJSONObject: stored) else { return }
        defaults.set(data, forKey: key)
      })
  }

  private static func blob(_ key: String, in defaults: UserDefaults) -> [String: Any]? {
    defaults.data(forKey: key).flatMap {
      try? JSONSerialization.jsonObject(with: $0) as? [String: Any]
    }
  }

  static let all: [SyncedSetting] = {
    let aids = "reading-aids.preferences.v1"
    let translateAids = "translate.reading-aids.v1"
    return [
      readingAid("readingAids.furigana", field: "showsFurigana", in: aids, standard: .bool(true)),
      readingAid("readingAids.romaji", field: "showsRomaji", in: aids, standard: .bool(false)),
      readingAid(
        "readingAids.wordMeanings", field: "showsWordMeanings", in: aids, standard: .bool(false)),
      readingAid(
        "readingAids.kanjiMeanings", field: "showsKanjiMeanings", in: aids, standard: .bool(true)),
      readingAid(
        "readingAids.translations", field: "showsTranslations", in: aids, standard: .bool(true)),
      readingAid(
        "readingAids.translationLanguage", field: "translationLanguage", in: aids,
        standard: .string(TranslationLanguage.english.rawValue)),
      readingAid(
        "readingAids.translationSource", field: "translationSource", in: aids,
        standard: .string(TranslationSource.youTube.rawValue)),
      readingAid(
        "readingAids.furiganaHiddenOnKnownWords", field: "hidesFuriganaOnKnownWords", in: aids,
        standard: .bool(false)),
      readingAid(
        "translate.furigana", field: "showsFurigana", in: translateAids, standard: .bool(false),
        furiganaStandard: false),
      plain("translate.speechSpeed", key: TranslateExperience.speechSpeedKey, standard: .decimal(1)),
      plain("search.sort", key: ResultsLearner.sortKey, standard: .string(ResultsLearner.defaultSort)),
      plain(
        "search.filter", key: ResultsLearner.filterKey, standard: .string(ResultsLearner.noFilter)),
      plain(
        "imageSearch.textView", key: ImageTextViewMode.storageKey,
        standard: .string(ImageTextViewMode.both.rawValue)),
      DailyGoal.setting,
    ]
  }()
}

@MainActor
final class SyncedSettings {
  static let shared = SyncedSettings(defaults: .standard)

  private let defaults: UserDefaults
  private let settings: [SyncedSetting]
  private var known: [String: SyncFieldValue] = [:]
  private var observer: NSObjectProtocol?
  var changeObserver: ((KeptLocalChange) -> Void)?

  init(defaults: UserDefaults, settings: [SyncedSetting] = SyncedSetting.all) {
    self.defaults = defaults
    self.settings = settings
    for setting in settings { known[setting.name] = setting.read(defaults) }
    observer = NotificationCenter.default.addObserver(
      forName: UserDefaults.didChangeNotification, object: defaults, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated { self?.noticeChanges() }
    }
  }

  func noticeChanges() {
    for setting in settings {
      let current = setting.read(defaults)
      let earlier = known[setting.name]
      guard current?.settingValue != earlier?.settingValue else { continue }
      known[setting.name] = current
      guard let current,
        earlier != nil || current.settingValue != setting.standard.settingValue
      else { continue }
      changeObserver?(KeptChanges.settingSet(setting.name, current))
    }
  }

  var changedFromStandard: [KeptLocalChange] {
    settings.compactMap { setting in
      guard let value = setting.read(defaults),
        value.settingValue != setting.standard.settingValue
      else { return nil }
      return KeptChanges.settingSet(setting.name, value)
    }
  }

  func applySynced(_ name: String, _ value: SyncFieldValue) {
    guard let setting = settings.first(where: { $0.name == name }) else { return }
    known[name] = value
    setting.write(defaults, value)
  }
}

extension SyncFieldValue {
  var plainValue: Any? {
    switch self {
    case .string(let text): text
    case .number(let number): Double(number)
    case .decimal(let number): number
    case .bool(let flag): flag
    case .null: nil
    }
  }

  var settingValue: String {
    switch self {
    case .string(let text): "s:\(text)"
    case .number(let number): "n:\(Double(number))"
    case .decimal(let number): "n:\(number)"
    case .bool(let flag): "b:\(flag)"
    case .null: "null"
    }
  }
}
