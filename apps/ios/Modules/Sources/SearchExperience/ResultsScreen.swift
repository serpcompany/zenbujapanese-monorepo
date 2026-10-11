import Foundation

enum FrequencyTier: String, Decodable, Sendable {
  case rare
  case uncommon
  case moderate
  case common
  case veryCommon
}

struct FrequencyChip: Decodable, Hashable, Sendable {
  let pack: String?
  let source: String
  let value: String
  let tier: FrequencyTier?
}

struct ListedWord: Decodable, Hashable, Sendable {
  let id: String
  let summary: String
  let chips: [FrequencyChip]
  let spoken: String

  func chips(onlyFirst: Bool) -> (shown: ArraySlice<FrequencyChip>, hidden: Int) {
    let shown = chips.prefix(onlyFirst ? 1 : .max)
    return (shown, chips.count - shown.count)
  }
}

struct ResultsChoice: Decodable, Hashable, Sendable {
  let value: String
  let title: String
  let announcement: String
}

struct ResultsMenuContent: Decodable, Hashable, Sendable {
  struct Sort: Decodable, Hashable, Sendable {
    let chosen: String
    let summary: String
    let options: [ResultsChoice]
  }

  struct Filter: Decodable, Hashable, Sendable {
    let chosen: String
    let title: String
    let options: [ResultsChoice]
  }

  let status: String
  let sort: Sort
  let filter: Filter
}

struct ResultsList: Decodable, Hashable, Sendable {
  enum Section: String, Decodable, Sendable {
    case examples
    case readingRefinement
    case results
    case discoveredWords
  }

  struct Examples: Decodable, Hashable, Sendable {
    let title: String
    let count: Int
    let highlightedEntry: String?
    let usesHighlightedEntryExamples: Bool
  }

  struct Refinement: Decodable, Hashable, Sendable {
    let query: String
    let title: String
    let spoken: String
  }

  struct Kanji: Decodable, Hashable, Sendable {
    let character: String
    let label: String
    let summary: String
    let entry: String?
    let spoken: String
  }

  let query: String
  let sections: [Section]
  let menu: ResultsMenuContent?
  let forgetsSort: Bool
  let examples: Examples?
  let readingRefinement: Refinement?
  let heading: String?
  let kanji: Kanji?
  let rows: [ListedWord]
  let hiddenByFilter: String?
  let frequencyNotice: String?
  let frequencyEntries: [String]
}

enum ResultsScreen: Decodable, Hashable, Sendable {
  case noResults
  case results(ResultsList)

  private enum CodingKeys: String, CodingKey {
    case state
  }

  init(from decoder: Decoder) throws {
    let state = try decoder.container(keyedBy: CodingKeys.self).decode(String.self, forKey: .state)
    self = state == "noResults" ? .noResults : .results(try ResultsList(from: decoder))
  }
}

struct ResultsLearner: Encodable, Hashable, Sendable {
  static let sortKey = "search.result-sort.v1"
  static let filterKey = "search.result-filter.v1"
  static let defaultSort = "default"
  static let noFilter = "all"

  var frequency: LearnerFrequency?
  var sort = Self.defaultSort
  var filter = Self.noFilter
  var known: [String] = []
  var fromRadicals = false
}

struct ResultsScreenRequest: Hashable, Sendable {
  let query: SearchQuery
  let results: String
  let exampleCount: Int
  var learner: ResultsLearner

  func screen() async throws -> ResultsScreen {
    var request = JSONBytes()
    request.append("{\"query\":")
    request.appendString(query.value)
    request.append(",\"results\":")
    request.append(results)
    request.append(",\"exampleCount\":\(exampleCount),\"learner\":")
    request.append(try DictionaryCore.argument(learner))
    request.append("}")
    return try PresentationCore.shared.answer("resultsScreen", request.text)
  }
}

struct WordRowsRequest: Encodable, Hashable, Sendable {
  struct Entry: Encodable, Hashable, Sendable {
    let id: String
    let summary: String
  }

  let entries: [Entry]
  var frequency: LearnerFrequency?
  let known: [String]

  func rowsByEntry() -> [String: ListedWord] {
    let rows: [ListedWord]? = try? PresentationCore.shared.answer("wordRows", self)
    return Dictionary((rows ?? []).map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
  }
}

struct FrequencyRow: Decodable, Hashable, Identifiable, Sendable {
  struct Details: Decodable, Hashable, Sendable {
    struct Pack: Decodable, Hashable, Sendable {
      let name: String
      let domain: String
      let description: String
      let version: String
      let source: String
    }

    struct Row: Decodable, Hashable, Sendable {
      let label: String
      let value: String
    }

    let pack: Pack?
    let section: String
    let rows: [Row]
    let explanation: String?
  }

  let pack: String?
  let source: String
  let value: String
  let tier: FrequencyTier?
  let label: String
  let details: Details

  var id: String { pack ?? "frequency-unavailable" }

  private struct Request: Encodable {
    let entry: String
    let frequency: LearnerFrequency
  }

  static func rows(
    for id: LanguageReferenceID, using capability: FrequencyCapability
  ) async -> [FrequencyRow] {
    let frequency =
      (try? await capability.evidence(for: [id])).map { LearnerFrequency($0, for: [id]) }
      ?? .unavailable(for: [id], reason: "Frequency data unavailable")
    let rows: [FrequencyRow]? = try? PresentationCore.shared.answer(
      "frequencyRows", Request(entry: id.rawValue, frequency: frequency))
    return rows ?? []
  }
}
