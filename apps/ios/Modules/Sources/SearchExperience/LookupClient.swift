import Foundation
import SQLite3

struct LookupClient: Sendable {
  var search: @Sendable (SearchQuery) async throws -> LookupSearchResults
  var entry: @Sendable (LanguageReferenceID) async throws -> DictionaryEntry?
  var entries:
    @Sendable ([LanguageReferenceID]) async throws -> [LanguageReferenceID: DictionaryEntry]
  var entryMatchingForm: @Sendable (String) async throws -> DictionaryEntry?
  var entriesMatchingForm: @Sendable (String) async throws -> [DictionaryEntry]
  var entriesContainingKanji: @Sendable (String) async throws -> [DictionaryEntry]

  init(
    search: @escaping @Sendable (SearchQuery) async throws -> LookupSearchResults,
    entry: @escaping @Sendable (LanguageReferenceID) async throws -> DictionaryEntry?,
    entries: (
      @Sendable ([LanguageReferenceID]) async throws -> [LanguageReferenceID: DictionaryEntry]
    )? = nil,
    entryMatchingForm: @escaping @Sendable (String) async throws -> DictionaryEntry?,
    entriesMatchingForm: @escaping @Sendable (String) async throws -> [DictionaryEntry],
    entriesContainingKanji: @escaping @Sendable (String) async throws -> [DictionaryEntry]
  ) {
    self.search = search
    self.entry = entry
    self.entries =
      entries ?? { ids in
        var found: [LanguageReferenceID: DictionaryEntry] = [:]
        for id in ids { found[id] = try await entry(id) }
        return found
      }
    self.entryMatchingForm = entryMatchingForm
    self.entriesMatchingForm = entriesMatchingForm
    self.entriesContainingKanji = entriesContainingKanji
  }

  static let live: LookupClient = {
    LookupClient(
      search: { query in
        return try await LanguageReferenceData.shared.search(query)
      },
      entry: { id in try await LanguageReferenceData.shared.entry(id) },
      entries: { ids in try await LanguageReferenceData.shared.entries(equivalentTo: ids) },
      entryMatchingForm: { form in try await LanguageReferenceData.shared.entry(matchingForm: form)
      },
      entriesMatchingForm: { form in
        try await LanguageReferenceData.shared.entries(matchingForm: form)
      },
      entriesContainingKanji: { character in
        try await LanguageReferenceData.shared.entries(containingKanji: character)
      }
    )
  }()
}

actor LanguageReferenceData {
  static let shared = LanguageReferenceData()

  var statements: SQLiteStatements?
  private var core: DictionaryCore?
  private var searchResultCache: [SearchQuery: LookupSearchResults] = [:]
  private var searchCacheOrder: [SearchQuery] = []
  let databaseURL: URL?
  let validatesBundledArtifact: Bool
  private let morphology: JapaneseMorphologyClient

  init(
    databaseURL: URL? = nil,
    validatesBundledArtifact: Bool = true,
    morphology: JapaneseMorphologyClient = .live
  ) {
    self.databaseURL = databaseURL
    self.validatesBundledArtifact = validatesBundledArtifact
    self.morphology = morphology
  }

  func search(_ query: SearchQuery) async throws -> LookupSearchResults {
    try Task<Never, Never>.checkCancellation()
    if let cached = searchResultCache[query] {
      searchCacheOrder.removeAll { $0 == query }
      searchCacheOrder.append(query)
      return cached
    }

    let results = try await searchUncached(query)
    searchResultCache[query] = results
    searchCacheOrder.removeAll { $0 == query }
    searchCacheOrder.append(query)
    if searchCacheOrder.count > Self.searchCacheCapacity {
      searchResultCache[searchCacheOrder.removeFirst()] = nil
    }
    return results
  }

  func coreSearch(_ query: String) async throws -> DictionaryCoreSearchResults {
    try await coreAnswer("search", query)
  }

  private func searchUncached(_ query: SearchQuery) async throws -> LookupSearchResults {
    let found = try await coreSearch(query.value)
    let ids = found.items.map { LanguageReferenceID(rawValue: $0.id) }
    let entries = try entries(equivalentTo: ids)
    return LookupSearchResults(
      entries: try ids.map { id in
        guard let entry = entries[id] else { throw LookupDatabaseError.missingEntry }
        return entry
      },
      presentation: found.presentation,
      resolution: found.resolution,
      readingRefinement: found.readingRefinement.map { SearchRefinement(query: SearchQuery($0)) },
      usesPrimaryEntryExamples: found.usesPrimaryEntryExamples,
      primaryEntry: found.primaryEntry.flatMap { entries[LanguageReferenceID(rawValue: $0)] },
      listed: String(decoding: try JSONEncoder().encode(found), as: UTF8.self)
    )
  }

  func entry(_ id: LanguageReferenceID) throws -> DictionaryEntry? {
    try entries(equivalentTo: [id]).values.first
  }

  func entry(matchingForm form: String) async throws -> DictionaryEntry? {
    try await entries(matchingForm: form).first
  }

  func entries(matchingForm form: String) async throws -> [DictionaryEntry] {
    let families: [String: [DictionaryLinkCandidate]] = try await coreAnswer(
      "entriesMatchingFirstForms",
      String(decoding: try JSONEncoder().encode([[form]]), as: UTF8.self))
    return try entries(inOrder: (families[form] ?? []).map(\.id))
  }

  func entries(containingKanji character: String) async throws -> [DictionaryEntry] {
    try entries(inOrder: try await coreAnswer("entriesContainingKanji", character))
  }

  private func entries(inOrder ids: [String]) throws -> [DictionaryEntry] {
    let ids = ids.map(LanguageReferenceID.init(rawValue:))
    let found = try entries(equivalentTo: ids)
    return ids.compactMap { found[$0] }
  }

  func entries(
    equivalentTo ids: [LanguageReferenceID]
  ) throws -> [LanguageReferenceID: DictionaryEntry] {
    var listed: [String] = []
    var seen = Set<LanguageReferenceID>()
    for id in ids where id.bytes != nil && seen.insert(id).inserted {
      listed.append("\"\(id.rawValue)\"")
    }
    guard !listed.isEmpty else { return [:] }
    let statement = try openStatements().statement(Self.equivalentEntriesSQL)
    defer { sqlite3_reset(statement) }
    sqliteBind("[\(listed.joined(separator: ","))]", at: 1, to: statement)
    var groups: [String: [DictionaryEntry]] = [:]
    while try checkedSQLiteStep(statement) == .row {
      groups[sqliteText(statement, 15), default: []].append(try decodeEntry(from: statement))
    }
    var found: [LanguageReferenceID: DictionaryEntry] = [:]
    for members in groups.values {
      guard let entry = LanguageReferenceIdentity.normalizedEntry(members) else { continue }
      for member in members { found[member.id] = entry }
    }
    return found
  }

  private func coreAnswer<Answer: Decodable>(
    _ method: String,
    _ argument: String
  ) async throws -> Answer {
    try await preparedCore().answer(method, argument, analyzingWith: morphology)
  }

  private func preparedCore() throws -> DictionaryCore {
    if let core { return core }
    let prepared = try DictionaryCore(statements: try openStatements())
    core = prepared
    return prepared
  }

  private static let searchCacheCapacity = 32
}
