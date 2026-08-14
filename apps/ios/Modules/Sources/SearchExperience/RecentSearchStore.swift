import Foundation

struct RecentSearchStore: Sendable {
  var load: @Sendable () async -> [SearchQuery]
  var record: @Sendable (SearchQuery) async -> Void
  var remove: @Sendable (SearchQuery) async -> Void
  var removeAll: @Sendable () async -> Void

  static let live = RecentSearchStore(
    load: { await RecentSearchHistory.shared.load() },
    record: { query in await RecentSearchHistory.shared.record(query) },
    remove: { query in await RecentSearchHistory.shared.remove(query) },
    removeAll: { await RecentSearchHistory.shared.removeAll() }
  )
}

private actor RecentSearchHistory {
  static let shared = RecentSearchHistory()

  private let defaults = UserDefaults.standard
  private let storageKey = "lookup.recent-searches.v1"
  private var didPrepare = false

  func load() -> [SearchQuery] {
    resetForUITestingIfRequested()
    return (defaults.stringArray(forKey: storageKey) ?? []).map(SearchQuery.init)
  }

  func record(_ query: SearchQuery) {
    resetForUITestingIfRequested()
    guard !query.isEmpty else { return }
    var searches = defaults.stringArray(forKey: storageKey) ?? []
    searches.removeAll { $0 == query.value }
    searches.insert(query.value, at: 0)
    defaults.set(Array(searches.prefix(50)), forKey: storageKey)
  }

  func remove(_ query: SearchQuery) {
    resetForUITestingIfRequested()
    let searches = (defaults.stringArray(forKey: storageKey) ?? []).filter { $0 != query.value }
    defaults.set(searches, forKey: storageKey)
  }

  func removeAll() {
    resetForUITestingIfRequested()
    defaults.removeObject(forKey: storageKey)
  }

  private func resetForUITestingIfRequested() {
    guard !didPrepare else { return }
    didPrepare = true
    #if DEBUG
    if ProcessInfo.processInfo.arguments.contains("-ResetRecentSearches") {
      defaults.removeObject(forKey: storageKey)
    }
    #endif
  }
}
