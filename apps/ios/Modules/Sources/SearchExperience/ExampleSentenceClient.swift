import Foundation

struct ExampleSentenceClient: Sendable {
  var directCount: @Sendable (SearchQuery) async -> Int
  var count: @Sendable (SearchQuery, LookupSearchResults) async -> Int
  var listed:
    @Sendable (
      _ query: SearchQuery, _ highlightedEntry: DictionaryEntry?,
      _ usesHighlightedEntryExamples: Bool, _ batch: ExampleBatch
    ) async -> ExamplePage?
  var entryExamples:
    @Sendable (_ entry: DictionaryEntry, _ batch: ExampleBatch) async throws -> EntryExamples
  var formExamples: @Sendable (_ form: String, _ batch: ExampleBatch) async -> ExamplePage?
  var meaningExamples: @Sendable (_ entry: DictionaryEntry) async -> MeaningExamples

  static let live = ExampleSentenceClient(text: .shared)

  init(text: DictionaryTextData) {
    directCount = { query in (try? await text.exampleCount(query.value)) ?? 0 }
    count = { query, results in
      let request = ResultsExamplesRequest(
        query: query.value, primaryEntry: results.primaryEntry?.id.rawValue,
        usesPrimaryEntryExamples: results.usesPrimaryEntryExamples)
      return (try? await text.resultsExampleCount(request)) ?? 0
    }
    listed = { query, highlightedEntry, usesHighlightedEntryExamples, batch in
      let request = ResultsExamplesRequest(
        query: query.value, primaryEntry: highlightedEntry?.id.rawValue,
        usesPrimaryEntryExamples: usesHighlightedEntryExamples, batch: batch)
      return (try? await text.resultsExamples(request)).map(ExamplePage.init)
    }
    entryExamples = { entry, batch in
      do {
        let found = try await text.entryExamples(entry.id, batch)
        return EntryExamples(
          page: ExamplePage(found.page), count: found.count, truncated: found.truncated)
      } catch DictionaryCoreError.failed("missingEntryEvidence") {
        throw ExampleSentenceRetrievalError.invalidQuery(.missingEntryEvidence)
      } catch is DictionaryCoreError {
        throw ExampleSentenceRetrievalError.retrievalUnavailable(.queryFailed)
      }
    }
    formExamples = { form, batch in
      (try? await text.formExamples(form, batch)).map(ExamplePage.init)
    }
    meaningExamples = { entry in
      guard let found = try? await text.meaningExamples(entry.id) else { return MeaningExamples() }
      return MeaningExamples(
        bySense: Dictionary(
          found.map { shown in (shown.number, LinkedExample(shown.example)) },
          uniquingKeysWith: { first, _ in first }))
    }
  }

  func examples(_ entry: DictionaryEntry, _ batch: ExampleBatch) async throws -> ExamplePage {
    try await entryExamples(entry, batch).page
  }

  func shownExamples(_ entry: DictionaryEntry, _ batch: ExampleBatch) async -> ExamplePage? {
    do {
      return try await examples(entry, batch)
    } catch ExampleSentenceRetrievalError.invalidQuery {
      return ExamplePage(examples: [], listed: 0, countText: nil, cutShort: false)
    } catch {
      return nil
    }
  }
}

extension LinkedExample {
  fileprivate init(_ example: LinkedExamples.Example) {
    self.init(
      sentence: ExampleSentence(
        id: example.id, japanese: example.japanese, english: example.english),
      words: JapaneseTextToken.words(example.words))
  }
}

extension ExamplePage {
  fileprivate init(_ linked: LinkedExamples) {
    self.init(
      examples: linked.examples.map(LinkedExample.init),
      listed: linked.listed,
      countText: linked.countText,
      cutShort: linked.cutShort)
  }
}
