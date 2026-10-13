import Foundation

struct ExampleSentenceClient: Sendable {
  var directCount: @Sendable (SearchQuery) async -> Int
  var count: @Sendable (SearchQuery, LookupSearchResults) async -> Int
  var listed:
    @Sendable (
      _ query: SearchQuery, _ highlightedEntry: DictionaryEntry?,
      _ usesHighlightedEntryExamples: Bool, _ from: Int
    ) async -> ExamplePage
  var entryExamples:
    @Sendable (_ entry: DictionaryEntry, _ from: Int) async throws -> EntryExamples
  var formExamples: @Sendable (_ form: String, _ from: Int) async -> ExamplePage

  static let live = ExampleSentenceClient(
    text: .shared, linked: LinkedEntries(lookupClient: .live))

  init(text: DictionaryTextData, linked: LinkedEntries) {
    directCount = { query in (try? await text.exampleCount(query.value)) ?? 0 }
    count = { query, results in
      let request = ResultsExamplesRequest(
        query: query.value, primaryEntry: results.primaryEntry?.id.rawValue,
        usesPrimaryEntryExamples: results.usesPrimaryEntryExamples)
      return (try? await text.resultsExampleCount(request)) ?? 0
    }
    listed = { query, highlightedEntry, usesHighlightedEntryExamples, from in
      let request = ResultsExamplesRequest(
        query: query.value, primaryEntry: highlightedEntry?.id.rawValue,
        usesPrimaryEntryExamples: usesHighlightedEntryExamples, from: from)
      guard let found = try? await text.resultsExamples(request) else { return .empty }
      return await linked.page(found, highlightedEntry: highlightedEntry)
    }
    entryExamples = { entry, from in
      do {
        let found = try await text.entryExamples(entry.id, from: from)
        return EntryExamples(
          page: await linked.page(found.page, highlightedEntry: entry), count: found.count,
          truncated: found.truncated)
      } catch DictionaryCoreError.failed("missingEntryEvidence") {
        throw ExampleSentenceRetrievalError.invalidQuery(.missingEntryEvidence)
      } catch is DictionaryCoreError {
        throw ExampleSentenceRetrievalError.retrievalUnavailable(.queryFailed)
      }
    }
    formExamples = { form, from in
      guard let found = try? await text.formExamples(form, from: from) else { return .empty }
      return await linked.page(found, highlightedEntry: nil)
    }
  }

  func examples(_ entry: DictionaryEntry, from: Int) async throws -> ExamplePage {
    try await entryExamples(entry, from).page
  }
}

extension LinkedEntries {
  fileprivate func page(
    _ linked: LinkedExamples, highlightedEntry: DictionaryEntry?
  ) async -> ExamplePage {
    let words = await tokens(linked.examples.map(\.words), highlightedEntry: highlightedEntry)
    return ExamplePage(
      examples: zip(linked.examples, words).map { example, words in
        LinkedExample(
          sentence: ExampleSentence(
            id: example.id, japanese: example.japanese, english: example.english),
          words: words)
      },
      listed: linked.listed,
      countText: linked.countText)
  }
}
