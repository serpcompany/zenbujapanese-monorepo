import SwiftUI

struct KnowledgeRows: Equatable, Sendable {
  struct Word: Equatable, Sendable {
    let entry: DictionaryEntry
    let row: ListedWord
  }

  static let none = KnowledgeRows(words: [:])

  let words: [String: Word]

  func word(for record: WordKnowledgeRecord) -> Word? {
    words[record.entryID]
  }

  static func resolving(
    _ records: [WordKnowledgeRecord], known: Set<String>, using lookupClient: LookupClient,
    core: PresentationCore = .shared
  ) async -> KnowledgeRows {
    let ids = records.filter { $0.kanji == nil }.map { LanguageReferenceID(rawValue: $0.entryID) }
    let found = (try? await lookupClient.entries(ids)) ?? [:]
    let entries = ids.compactMap { id in found[id].flatMap { $0.id == id ? $0 : nil } }
    await core.frequencyLists?.ready()
    let rows = WordRowsRequest(
      entries: entries.map { WordRowsRequest.Entry(id: $0.id.rawValue, summary: $0.summary) },
      known: entries.map(\.id.rawValue).filter(known.contains)
    ).rowsByEntry(using: core)
    let words = entries.compactMap { entry in
      rows[entry.id.rawValue].map { (entry.id.rawValue, Word(entry: entry, row: $0)) }
    }
    return KnowledgeRows(words: Dictionary(words, uniquingKeysWith: { first, _ in first }))
  }

  static func kanjiRow(
    _ character: KanjiCharacter, using lookupClient: LookupClient,
    core: PresentationCore = .shared
  ) async -> ResultsList.Kanji? {
    let query = SearchQuery(character.rawValue)
    guard let results = try? await lookupClient.search(query),
      case .results(let list)? = try? await ResultsScreenRequest(
        query: query, results: results.listed, exampleCount: 0, learner: ResultsLearner()
      ).screen(using: core)
    else { return nil }
    return list.kanji
  }
}

struct KnowledgeRow: View {
  let record: WordKnowledgeRecord
  let rows: KnowledgeRows
  let lookupClient: LookupClient
  let open: @MainActor () -> Void

  var body: some View {
    if let character = record.kanji {
      KnowledgeKanjiRow(
        record: record, character: character, lookupClient: lookupClient, open: open)
    } else if let word = rows.word(for: record) {
      ResultRow(entry: word.entry, row: word.row, open: open)
    } else {
      SavedRecordRow(record: record, open: open)
    }
  }
}

private struct KnowledgeKanjiRow: View {
  let record: WordKnowledgeRecord
  let character: KanjiCharacter
  let lookupClient: LookupClient
  let open: @MainActor () -> Void
  @State private var kanji: ResultsList.Kanji?

  var body: some View {
    if let kanji {
      KanjiPrimaryRow(kanji: kanji, opening: .action(open))
        .knownWordActions(
          record.item, identifierPrefix: KanjiPrimaryRow.identifier(kanji.character))
    } else {
      SavedRecordRow(record: record, open: open)
        .task(id: character) {
          kanji = await KnowledgeRows.kanjiRow(character, using: lookupClient)
        }
    }
  }
}

private struct SavedRecordRow: View {
  @Environment(WordKnowledge.self) private var wordKnowledge
  let record: WordKnowledgeRecord
  let open: @MainActor () -> Void

  var body: some View {
    RowOpener(opening: RowOpening<Never>.action(open)) {
      SavedWordRow(
        headword: record.headword, reading: record.reading,
        isKnown: wordKnowledge.isKnown(storedID: record.entryID))
    }
    .accessibilityIdentifier(identifier)
    .knownWordActions(record.item, identifierPrefix: identifier)
  }

  private var identifier: String { "known-words.item.\(record.entryID)" }
}
