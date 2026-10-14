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
    listed = { query, highlightedEntry, usesHighlightedEntryExamples, batch in
      let request = ResultsExamplesRequest(
        query: query.value, primaryEntry: highlightedEntry?.id.rawValue,
        usesPrimaryEntryExamples: usesHighlightedEntryExamples, batch: batch)
      guard let found = try? await text.resultsExamples(request) else { return nil }
      return await linked.page(found, highlightedEntry: highlightedEntry)
    }
    entryExamples = { entry, batch in
      do {
        let found = try await text.entryExamples(entry.id, batch)
        return EntryExamples(
          page: await linked.page(found.page, highlightedEntry: entry), count: found.count,
          truncated: found.truncated)
      } catch DictionaryCoreError.failed("missingEntryEvidence") {
        throw ExampleSentenceRetrievalError.invalidQuery(.missingEntryEvidence)
      } catch is DictionaryCoreError {
        throw ExampleSentenceRetrievalError.retrievalUnavailable(.queryFailed)
      }
    }
    formExamples = { form, batch in
      guard let found = try? await text.formExamples(form, batch) else { return nil }
      return await linked.page(found, highlightedEntry: nil)
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
      countText: linked.countText,
      cutShort: linked.cutShort)
  }
}
