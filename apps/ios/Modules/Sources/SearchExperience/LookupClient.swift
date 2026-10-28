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
  var relatedWord: @Sendable (DictionaryRelationship) async throws -> DictionaryEntry?
  var savedWord:
    @Sendable (_ id: String, _ headword: String, _ reading: String) async throws
      -> WebsiteLinkRoute
  var websiteRoute: @Sendable (URL) async -> WebsiteLinkRoute
  var lookUp: @Sendable (String) async -> WebsiteLinkRoute

  init(
    search: @escaping @Sendable (SearchQuery) async throws -> LookupSearchResults,
    entry: @escaping @Sendable (LanguageReferenceID) async throws -> DictionaryEntry?,
    entries: (
      @Sendable ([LanguageReferenceID]) async throws -> [LanguageReferenceID: DictionaryEntry]
    )? = nil,
    entryMatchingForm: @escaping @Sendable (String) async throws -> DictionaryEntry?,
    entriesMatchingForm: @escaping @Sendable (String) async throws -> [DictionaryEntry],
    entriesContainingKanji: @escaping @Sendable (String) async throws -> [DictionaryEntry],
    relatedWord: @escaping @Sendable (DictionaryRelationship) async throws -> DictionaryEntry? = {
      _ in nil
    },
    savedWord: @escaping @Sendable (String, String, String) async throws -> WebsiteLinkRoute = {
      _, headword, _ in .search(headword)
    },
    websiteRoute: @escaping @Sendable (URL) async -> WebsiteLinkRoute = { _ in .home },
    lookUp: @escaping @Sendable (String) async -> WebsiteLinkRoute = { .search($0) }
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
    self.relatedWord = relatedWord
    self.savedWord = savedWord
    self.websiteRoute = websiteRoute
    self.lookUp = lookUp
  }

  static let live = LookupClient.reading(.shared)

  static func reading(_ data: LanguageReferenceData) -> LookupClient {
    LookupClient(
      search: { query in try await data.search(query) },
      entry: { id in try await data.entry(id) },
      entries: { ids in try await data.entries(equivalentTo: ids) },
      entryMatchingForm: { form in try await data.entry(matchingForm: form) },
      entriesMatchingForm: { form in try await data.entries(matchingForm: form) },
      entriesContainingKanji: { character in try await data.entries(containingKanji: character) },
      relatedWord: { try await data.word(related: $0) },
      savedWord: { id, headword, reading in
        try await data.route(openingSaved: SavedWord(id: id, headword: headword, reading: reading))
      },
      websiteRoute: { await data.route(openingWebsite: $0) },
      lookUp: { await data.route(lookingUp: $0) }
    )
  }
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

  func answeredSearch(_ query: String) async throws -> String {
    try await preparedCore().answerAsWritten("search", query, analyzingWith: morphology)
  }

  private func searchUncached(_ query: SearchQuery) async throws -> LookupSearchResults {
    try results(answered: try await answeredSearch(query.value))
  }

  func results(answered: String) throws -> LookupSearchResults {
    let found = try JSONDecoder().decode(
      DictionaryCoreSearchResults.self, from: Data(answered.utf8))
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
      listed: answered
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
      try DictionaryCore.argument([[form]]))
    return try entries(inOrder: (families[form] ?? []).map(\.id))
  }

  func entries(containingKanji character: String) async throws -> [DictionaryEntry] {
    try entries(inOrder: try await coreAnswer("entriesContainingKanji", character))
  }

  func word(related relationship: DictionaryRelationship) async throws -> DictionaryEntry? {
    try entry(named: try await coreAnswer("relatedWord", RelatedWord(relationship)))
  }

  func route(openingSaved word: SavedWord) async throws -> WebsiteLinkRoute {
    let page: WebsitePage = try await coreAnswer("savedWord", word)
    guard page.kind == "word" else { return route(opening: page) }
    guard let entry = try? entry(named: page.id) else { return .search(word.headword) }
    return .open(.word(entry, nil))
  }

  func route(openingWebsite url: URL) async -> WebsiteLinkRoute {
    let link = WebsiteAddress(host: url.host(), path: url.path(percentEncoded: true))
    guard let page: WebsitePage = try? await coreAnswer("websiteRoute", link) else { return .home }
    return route(opening: page)
  }

  func route(lookingUp text: String) async -> WebsiteLinkRoute {
    guard let page: WebsitePage = try? await coreAnswer("lookUp", text) else {
      return .search(text)
    }
    return route(opening: page)
  }

  private func route(opening page: WebsitePage) -> WebsiteLinkRoute {
    switch page.kind {
    case "word":
      guard let entry = try? entry(named: page.id) else { return .home }
      return .open(.word(entry, nil))
    case "kanji":
      return page.character.flatMap(KanjiCharacter.init).map { .open(.kanji($0, nil)) } ?? .home
    case "search":
      return page.query.map(WebsiteLinkRoute.search) ?? .home
    default:
      return .home
    }
  }

  private func entry(named id: String?) throws -> DictionaryEntry? {
    try id.flatMap { try entry(LanguageReferenceID(rawValue: $0)) }
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
    let argument = "[\(listed.joined(separator: ","))]"
    let glosses = try self.glosses(ofEntriesEquivalentTo: argument)
    let statement = try openStatements().statement(Self.equivalentEntriesSQL)
    defer { sqlite3_reset(statement) }
    sqliteBind(argument, at: 1, to: statement)
    var groups: [String: [DictionaryEntry]] = [:]
    while try checkedSQLiteStep(statement) == .row {
      groups[sqliteText(statement, 14), default: []].append(
        try decodeEntry(from: statement, glosses: glosses))
    }
    var found: [LanguageReferenceID: DictionaryEntry] = [:]
    for members in groups.values where members.count == 1 {
      found[members[0].id] = members[0]
    }
    let equivalents = groups.values.filter { $0.count > 1 }
    guard !equivalents.isEmpty else { return found }
    let canonical: [String?] = try preparedCore().answer(
      "canonicalEntries",
      try DictionaryCore.argument(equivalents.map { $0.map(\.id.rawValue) }))
    for (members, id) in zip(equivalents, canonical) {
      guard let entry = members.first(where: { $0.id.rawValue == id }) else { continue }
      let merged = entry.withSourceProvenances(members.flatMap(\.sourceProvenances))
      for member in members { found[member.id] = merged }
    }
    return found
  }

  private func coreAnswer<Answer: Decodable>(
    _ method: String,
    _ argument: String
  ) async throws -> Answer {
    try await preparedCore().answer(method, argument, analyzingWith: morphology)
  }

  private func coreAnswer<Answer: Decodable>(
    _ method: String,
    _ argument: some Encodable
  ) async throws -> Answer {
    try await coreAnswer(method, try DictionaryCore.argument(argument))
  }

  func preparedCore() throws -> DictionaryCore {
    if let core { return core }
    let prepared = try DictionaryCore(statements: try openStatements())
    core = prepared
    return prepared
  }

  private static let searchCacheCapacity = 32
}

struct SavedWord: Encodable, Sendable {
  let id: String
  let headword: String
  let reading: String
}

private struct RelatedWord: Encodable {
  let relationship: DictionaryRelationship

  init(_ relationship: DictionaryRelationship) {
    self.relationship = relationship
  }

  private enum CodingKeys: String, CodingKey {
    case targetID
    case query
    case headword
    case reading
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(relationship.targetID, forKey: .targetID)
    try container.encode(relationship.query, forKey: .query)
    try container.encode(relationship.headword, forKey: .headword)
    try container.encode(relationship.reading, forKey: .reading)
  }
}

private struct WebsiteAddress: Encodable {
  let host: String?
  let path: String

  private enum CodingKeys: String, CodingKey {
    case host
    case path
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(host, forKey: .host)
    try container.encode(path, forKey: .path)
  }
}

private struct WebsitePage: Decodable {
  let kind: String
  let id: String?
  let character: String?
  let query: String?
}
