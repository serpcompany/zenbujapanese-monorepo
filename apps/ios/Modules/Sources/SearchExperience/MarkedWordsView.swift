import SwiftUI

struct MarkedWords {
  let status: WordKnowledgeStatus
  let title: String
  let identifier: String
  let rowSymbol: String
  let tint: Color
  let emptyTitle: String
  let emptySymbol: String
  let emptyDescription: String
  let name: String

  static let known = MarkedWords(
    status: .known, title: "Known Words", identifier: "known-words",
    rowSymbol: "checkmark.circle.fill", tint: .teal, emptyTitle: "No Known Words",
    emptySymbol: "checkmark.circle",
    emptyDescription: "Words and kanji you mark as known on their pages will appear here.",
    name: "Known words")
  static let learning = MarkedWords(
    status: .learning, title: "Learning", identifier: "learning",
    rowSymbol: WordStatusTag.learningSymbol, tint: .yellow, emptyTitle: "Nothing in Learning",
    emptySymbol: WordStatusTag.learningSymbol,
    emptyDescription: "Words and kanji you mark as Learning on their pages will appear here.",
    name: "Learning words")
  static let all = [known, learning]

  static func of(_ status: WordKnowledgeStatus) -> MarkedWords {
    all.first { $0.status == status } ?? known
  }
}

struct MarkedWordsView: View {
  @Environment(WordKnowledge.self) private var wordKnowledge
  @State private var searchText = ""
  @State private var rows: KnowledgeRows?
  let words: MarkedWords
  let lookupClient: LookupClient
  let openWord: (WordKnowledgeRecord) -> Void

  var body: some View {
    let marked = wordKnowledge.marked(words.status)
    let records = filtered(marked)
    Group {
      if !wordKnowledge.isLoaded || (rows == nil && !marked.isEmpty) {
        ProgressView("Loading \(words.title)")
          .accessibilityIdentifier("\(words.identifier).loading")
      } else if marked.isEmpty {
        ContentUnavailableView(
          words.emptyTitle,
          systemImage: words.emptySymbol,
          description: Text(readOnlyMessage ?? words.emptyDescription)
        )
        .accessibilityIdentifier("\(words.identifier).empty")
      } else {
        List {
          Section {
            ForEach(records) { record in
              KnowledgeRow(
                record: record, rows: rows ?? .none, lookupClient: lookupClient
              ) {
                openWord(record)
              }
            }
          } footer: {
            if let readOnlyMessage {
              Text(readOnlyMessage)
                .accessibilityIdentifier("\(words.identifier).read-only")
            }
          }
        }
        .listStyle(.plain)
        .overlay {
          if records.isEmpty {
            ContentUnavailableView.search(text: searchText)
          }
        }
        .searchable(text: $searchText, prompt: "Search \(words.name.lowercased())")
        .accessibilityIdentifier("\(words.identifier).list")
      }
    }
    .task(id: rowsRequest) {
      guard wordKnowledge.isLoaded else { return }
      guard let resolved = await wordKnowledge.rows(for: wordKnowledge.marked(words.status), using: lookupClient)
      else { return }
      rows = resolved
    }
    .navigationTitle(words.title)
  }

  private var readOnlyMessage: String? {
    switch wordKnowledge.readOnlyReason {
    case .newerVersion:
      "\(words.name) can’t be changed because they were saved by a newer version of Zenbu."
    case .couldNotKeepCopy:
      "\(words.name) can’t be saved right now. Free up storage and reopen Zenbu."
    case .couldNotRead:
      "\(words.name) couldn’t be loaded. Reopen Zenbu to try again."
    case nil:
      nil
    }
  }

  private func filtered(_ records: [WordKnowledgeRecord]) -> [WordKnowledgeRecord] {
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return records }
    return records.filter {
      $0.headword.localizedStandardContains(query) || $0.reading.localizedStandardContains(query)
    }
  }

  private var rowsRequest: RowsRequest {
    RowsRequest(
      isLoaded: wordKnowledge.isLoaded, records: wordKnowledge.marked(words.status),
      lists: FrequencyLists.live.version)
  }

  private struct RowsRequest: Equatable {
    let isLoaded: Bool
    let records: [WordKnowledgeRecord]
    let lists: Int
  }
}

struct SavedWordRow: View {
  let headword: String
  let reading: String
  var date: Date?
  var status = WordKnowledgeStatus.unknown

  var body: some View {
    HStack {
      JapaneseRubyText(
        ruby: JapaneseRuby(surface: headword, reading: reading),
        baseFont: .title3,
        rubyFont: .caption.weight(.semibold),
        highlightsKanjiOnTap: false
      )
      Spacer()
      WordStatusTag(status)
      if let date {
        Text(date, format: .dateTime.month().day())
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(headword), \(reading)")
    .accessibilityValue(WordStatusTag(status) == nil ? Text("") : Text(status.title))
  }
}
