import Foundation
import Observation

@MainActor
@Observable
final class ReadingAidPreferences {
  private struct StoredPreferences: Codable {
    let showsFurigana: Bool
    let showsRomaji: Bool
  }

  private static let storageKey = "reading-aids.preferences.v1"
  private static var didPrepareDefaultsForProcess = false
  private let defaults: UserDefaults

  var showsFurigana = true {
    didSet { persist() }
  }
  var showsRomaji = false {
    didSet { persist() }
  }

  init(
    defaults: UserDefaults = .standard,
    processArguments: [String] = ProcessInfo.processInfo.arguments
  ) {
    self.defaults = defaults
    let requestsReset = processArguments.contains("-ResetReadingAidPreferences")
    let resetsThisInitialization = requestsReset && !Self.didPrepareDefaultsForProcess
    if requestsReset { Self.didPrepareDefaultsForProcess = true }
    if resetsThisInitialization {
      defaults.removeObject(forKey: Self.storageKey)
    }
    guard
      let data = defaults.data(forKey: Self.storageKey),
      let stored = try? JSONDecoder().decode(StoredPreferences.self, from: data)
    else { return }
    showsFurigana = stored.showsFurigana
    showsRomaji = stored.showsRomaji
  }

  private func persist() {
    let stored = StoredPreferences(
      showsFurigana: showsFurigana,
      showsRomaji: showsRomaji
    )
    guard let data = try? JSONEncoder().encode(stored) else { return }
    defaults.set(data, forKey: Self.storageKey)
  }
}
