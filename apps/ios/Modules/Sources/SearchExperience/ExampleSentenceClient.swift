import Foundation

struct ExampleSentenceClient: Sendable {
  var directCount: @Sendable (SearchQuery) async -> Int
  var count: @Sendable (SearchQuery, LookupSearchResults) async -> Int
  var listed:
    @Sendable (
      _ query: SearchQuery, _ highlightedEntry: DictionaryEntry?,
      _ usesHighlightedEntryExamples: Bool
    ) async -> ListedExamples
  var entryExamples: @Sendable (DictionaryEntry) async throws -> EntryExamples
  var formExamples: @Sendable (String) async -> [ExampleSentence]

  static let live = ExampleSentenceClient(text: .shared)

  init(text: DictionaryTextData) {
    directCount = { query in (try? await text.exampleCount(query.value)) ?? 0 }
    count = { query, results in
      let request = ResultsExamplesRequest(
        query: query.value, primaryEntry: results.primaryEntry?.id.rawValue,
        usesPrimaryEntryExamples: results.usesPrimaryEntryExamples)
      return (try? await text.resultsExampleCount(request)) ?? 0
    }
    listed = { query, highlightedEntry, usesHighlightedEntryExamples in
      let request = ResultsExamplesRequest(
        query: query.value, primaryEntry: highlightedEntry?.id.rawValue,
        usesPrimaryEntryExamples: usesHighlightedEntryExamples)
      return (try? await text.resultsExamples(request)) ?? .empty
    }
    entryExamples = { entry in
      do {
        return try await text.entryExamples(entry.id)
      } catch DictionaryCoreError.failed("missingEntryEvidence") {
        throw ExampleSentenceRetrievalError.invalidQuery(.missingEntryEvidence)
      } catch is DictionaryCoreError {
        throw ExampleSentenceRetrievalError.retrievalUnavailable(.queryFailed)
      }
    }
    formExamples = { form in (try? await text.formExamples(form)) ?? [] }
  }

  func examples(_ entry: DictionaryEntry) async throws -> [ExampleSentence] {
    try await entryExamples(entry).sentences
  }
}
