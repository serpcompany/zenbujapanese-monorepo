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
  let examples: Examples?
  let readingRefinement: Refinement?
  let heading: String?
  let kanji: Kanji?
  let rows: [ListedWord]
  let hiddenByFilter: String?
  let frequencyNotice: String?
}

struct NoMatches: Decodable, Hashable, Sendable {
  let title: String
}

enum ResultsScreen: Decodable, Hashable, Sendable {
  case noResults(NoMatches)
  case results(ResultsList)

  private enum CodingKeys: String, CodingKey {
    case state
  }

  init(from decoder: Decoder) throws {
    let state = try decoder.container(keyedBy: CodingKeys.self).decode(String.self, forKey: .state)
    self =
      state == "noResults"
      ? .noResults(try NoMatches(from: decoder)) : .results(try ResultsList(from: decoder))
  }
}

struct ResultsLearner: Encodable, Hashable, Sendable {
  static let sortKey = "search.result-sort.v1"
  static let filterKey = "search.result-filter.v1"
  static let defaultSort = "default"
  static let noFilter = "all"

  var sort = Self.defaultSort
  var filter = Self.noFilter
  var known: [String] = []
  var learning: [String] = []
  var pickedKanji = false
}

struct ResultsScreenRequest: Hashable, Sendable {
  let query: SearchQuery
  let results: String
  let exampleCount: Int
  var learner: ResultsLearner
  var lists = 0

  func screen(using core: PresentationCore = .shared) async throws -> ResultsScreen {
    await core.frequencyLists?.ready()
    var request = JSONBytes()
    request.append("{\"query\":")
    request.appendString(query.value)
    request.append(",\"results\":")
    request.append(results)
    request.append(",\"exampleCount\":\(exampleCount),\"learner\":")
    request.append(try DictionaryCore.argument(learner))
    request.append("}")
    return try core.answer("resultsScreen", request.text)
  }
}

struct WordRowsRequest: Encodable, Hashable, Sendable {
  struct Entry: Encodable, Hashable, Sendable {
    let id: String
    let summary: String
  }

  let entries: [Entry]
  let known: [String]

  func rowsByEntry(using core: PresentationCore = .shared) -> [String: ListedWord] {
    let rows: [ListedWord]? = try? core.answer("wordRows", self)
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
}
