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

actor RecentSearchHistory {
  static let shared = RecentSearchHistory()
  static let kept = 50
  static let beforeTimesWereKept = Date(timeIntervalSince1970: 946_771_200)

  private let defaults: UserDefaults
  private let now: @Sendable () -> Date
  private let storageKey = "lookup.recent-searches.v1"
  private let timesKey = "lookup.recent-search-times.v1"
  nonisolated let relay = KeptChangeRelay()

  init(defaults: UserDefaults = .standard, now: @escaping @Sendable () -> Date = Date.init) {
    self.defaults = defaults
    self.now = now
  }

  func load() -> [SearchQuery] {
    (defaults.stringArray(forKey: storageKey) ?? []).map(SearchQuery.init)
  }

  func record(_ query: SearchQuery) async {
    guard !query.isEmpty else { return }
    let search = KeptSearch(query: query.value, searchedAt: now())
    write(placing(search, in: searches()))
    await relay.post(KeptChanges.searched(search))
  }

  func remove(_ query: SearchQuery) async {
    let searches = searches()
    guard searches.contains(where: { $0.query == query.value }) else { return }
    write(searches.filter { $0.query != query.value })
    await relay.post(KeptChanges.searchRemoved(query.value))
  }

  func removeAll() async {
    let searches = searches()
    write([])
    for search in searches { await relay.post(KeptChanges.searchRemoved(search.query)) }
  }

  func searches() -> [KeptSearch] {
    let times = defaults.dictionary(forKey: timesKey) as? [String: Date] ?? [:]
    let queries = defaults.stringArray(forKey: storageKey) ?? []
    return queries.enumerated().map { index, query in
      KeptSearch(
        query: query,
        searchedAt: times[query] ?? Self.beforeTimesWereKept + TimeInterval(queries.count - index))
    }
  }

  func applySynced(_ synced: [KeptSearch], removing gone: [String], under key: String) {
    let removed = Set(gone)
    let local = searches()
    let ids = Dictionary(
      (local + synced).map { ($0.query, KeptChanges.searchID($0.query, under: key) ?? "") }
    ) { first, _ in first }
    let kept = local.filter { !removed.contains(ids[$0.query] ?? "") }
    write(synced.reduce(kept) { placing($1, in: $0, ids: ids) })
  }

  private func placing(
    _ search: KeptSearch, in searches: [KeptSearch], ids: [String: String] = [:]
  ) -> [KeptSearch] {
    let earlier = searches.first { $0.query == search.query }
    let latest = max(search.searchedAt, earlier?.searchedAt ?? search.searchedAt)
    let others = searches.filter { $0.query != search.query }
    return Array(
      (others + [KeptSearch(query: search.query, searchedAt: latest)])
        .sorted {
          $0.searchedAt == $1.searchedAt
            ? ids[$0.query, default: ""] > ids[$1.query, default: ""]
            : $0.searchedAt > $1.searchedAt
        }
        .prefix(Self.kept))
  }

  private func write(_ searches: [KeptSearch]) {
    defaults.set(searches.map(\.query), forKey: storageKey)
    defaults.set(
      Dictionary(searches.map { ($0.query, $0.searchedAt) }) { first, _ in first }, forKey: timesKey)
  }
}
