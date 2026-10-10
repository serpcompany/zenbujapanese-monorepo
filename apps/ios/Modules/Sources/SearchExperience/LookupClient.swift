import Foundation
import SQLite3

struct LookupClient: Sendable {
  var search: @Sendable (SearchQuery) async throws -> LookupSearchResults
  var entry: @Sendable (LanguageReferenceID) async throws -> DictionaryEntry?
  var entryMatchingForm: @Sendable (String) async throws -> DictionaryEntry?
  var entriesMatchingForm: @Sendable (String) async throws -> [DictionaryEntry]
  var entriesMatchingFirstForms:
    @Sendable ([[String]], LinkCandidateChoice) async throws -> [[DictionaryEntry]]
  var entriesContainingKanji: @Sendable (String) async throws -> [DictionaryEntry]

  init(
    search: @escaping @Sendable (SearchQuery) async throws -> LookupSearchResults,
    entry: @escaping @Sendable (LanguageReferenceID) async throws -> DictionaryEntry?,
    entryMatchingForm: @escaping @Sendable (String) async throws -> DictionaryEntry?,
    entriesMatchingForm: @escaping @Sendable (String) async throws -> [DictionaryEntry],
    entriesMatchingFirstForms: (
      @Sendable ([[String]], LinkCandidateChoice) async throws -> [[DictionaryEntry]]
    )? = nil,
    entriesContainingKanji: @escaping @Sendable (String) async throws -> [DictionaryEntry]
  ) {
    self.search = search
    self.entry = entry
    self.entryMatchingForm = entryMatchingForm
    self.entriesMatchingForm = entriesMatchingForm
    self.entriesMatchingFirstForms =
      entriesMatchingFirstForms ?? { alternatives, choice in
        var matched: [[DictionaryEntry]] = []
        for (index, forms) in alternatives.enumerated() {
          var chosen: [DictionaryEntry] = []
          for form in forms {
            let family = try await entriesMatchingForm(form)
            guard !family.isEmpty else { continue }
            let ids = Set(choice(index, form, family.map(DictionaryLinkCandidate.init)))
            chosen = family.filter { ids.contains($0.id.rawValue) }
            break
          }
          matched.append(chosen)
        }
        return matched
      }
    self.entriesContainingKanji = entriesContainingKanji
  }

  static let live: LookupClient = {
    LookupClient(
      search: { query in
        return try await LanguageReferenceData.shared.search(query)
      },
      entry: { id in try await LanguageReferenceData.shared.entry(id) },
      entryMatchingForm: { form in try await LanguageReferenceData.shared.entry(matchingForm: form)
      },
      entriesMatchingForm: { form in
        try await LanguageReferenceData.shared.entries(matchingForm: form)
      },
      entriesMatchingFirstForms: { alternatives, choice in
        try await LanguageReferenceData.shared.entries(
          matchingFirstOf: alternatives, choosing: choice)
      },
      entriesContainingKanji: { character in
        try await LanguageReferenceData.shared.entries(containingKanji: character)
      }
    )
  }()
}

typealias LinkCandidateChoice = @Sendable (
  _ index: Int, _ form: String, _ family: [DictionaryLinkCandidate]
) -> [String]

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

  func coreNormalizedQuery(_ text: String) async throws -> String {
    try await coreAnswer("normalizeQuery", text)
  }

  private func searchUncached(_ query: SearchQuery) async throws -> LookupSearchResults {
    let found = try await coreSearch(query.value)
    let ids = found.items.map { LanguageReferenceID(rawValue: $0.id) }
    let entries = try entries(equivalentTo: ids)
    return LookupSearchResults(
      items: try zip(ids, found.items).map { id, item in
        guard let entry = entries[id] else { throw LookupDatabaseError.missingEntry }
        return LookupSearchResultItem(
          entry: entry,
          relevance: DictionaryRelevance(order: item.relevance),
          fallbackOrder: item.fallbackOrder,
          matchedSummary: item.matchedSummary
        )
      },
      leadingLexicalEntryCount: found.leadingLexicalEntryCount,
      presentation: found.presentation,
      resolution: found.resolution,
      readingRefinement: found.readingRefinement.map { SearchRefinement(query: SearchQuery($0)) },
      usesPrimaryEntryExamples: found.usesPrimaryEntryExamples
    )
  }

  func entry(_ id: LanguageReferenceID) throws -> DictionaryEntry? {
    try entries(equivalentTo: [id]).values.first
  }

  func entry(matchingForm form: String) async throws -> DictionaryEntry? {
    try await entries(matchingForm: form).first
  }

  func entries(matchingForm form: String) async throws -> [DictionaryEntry] {
    try await entries(matchingFirstOf: [[form]]) { _, _, family in family.map(\.id) }[0]
  }

  func entries(
    matchingFirstOf alternatives: [[String]],
    choosing choice: LinkCandidateChoice
  ) async throws -> [[DictionaryEntry]] {
    guard alternatives.contains(where: { !$0.isEmpty }) else { return alternatives.map { _ in [] } }
    let families: [String: [DictionaryLinkCandidate]] = try await coreAnswer(
      "entriesMatchingFirstForms",
      String(decoding: try JSONEncoder().encode(alternatives), as: UTF8.self))
    let chosen = alternatives.enumerated().map { index, forms -> [String] in
      guard let form = forms.first(where: { families[$0]?.isEmpty == false }) else { return [] }
      return choice(index, form, families[form] ?? [])
    }
    let entries = try entries(
      equivalentTo: chosen.joined().map(LanguageReferenceID.init(rawValue:)))
    return chosen.map { $0.compactMap { entries[LanguageReferenceID(rawValue: $0)] } }
  }

  func entries(containingKanji character: String) async throws -> [DictionaryEntry] {
    try entries(inOrder: try await coreAnswer("entriesContainingKanji", character))
  }

  private func entries(inOrder ids: [String]) throws -> [DictionaryEntry] {
    let ids = ids.map(LanguageReferenceID.init(rawValue:))
    let found = try entries(equivalentTo: ids)
    return ids.compactMap { found[$0] }
  }

  private func entries(
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
    do {
      let call = try preparedCore().begin(method, argument)
      while true {
        switch try call.step(Answer.self) {
        case .finished(let answer):
          try Task<Never, Never>.checkCancellation()
          return answer
        case .analyzing(let text):
          try call.analyzed(await analysisJSON(text))
        }
      }
    } catch {
      try Task<Never, Never>.checkCancellation()
      throw error
    }
  }

  private func preparedCore() throws -> DictionaryCore {
    if let core { return core }
    let prepared = try DictionaryCore(statements: try openStatements())
    core = prepared
    return prepared
  }

  private func analysisJSON(_ text: String) async -> String {
    guard let analysis = try? await morphology.analyze(text),
      let json = try? JSONEncoder().encode(DictionaryCoreAnalysis(analysis))
    else { return #"{"error":"The text could not be analyzed"}"# }
    return String(decoding: json, as: UTF8.self)
  }

  private static let searchCacheCapacity = 32
}
