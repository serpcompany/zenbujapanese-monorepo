import SwiftUI

struct KnownWordMenuButton: View {
  @Environment(WordKnowledge.self) private var wordKnowledge
  let item: SavedItem
  var identifierPrefix = "word-detail"

  var body: some View {
    let isKnown = wordKnowledge.isKnown(item)
    let title: LocalizedStringKey =
      wordKnowledge.isReadOnly
      ? "Known Words Can’t Be Changed" : isKnown ? "Mark as Unknown" : "Mark as Known"
    Button(title, systemImage: isKnown ? "xmark.circle" : "checkmark.circle") {
      wordKnowledge.toggleKnown(item)
    }
    .disabled(!wordKnowledge.isLoaded || wordKnowledge.isReadOnly)
    .accessibilityIdentifier("\(identifierPrefix).\(isKnown ? "mark-unknown" : "mark-known")")
  }
}

private struct KnownWordActions: ViewModifier {
  @Environment(WordKnowledge.self) private var wordKnowledge
  let item: SavedItem
  let identifierPrefix: String

  func body(content: Content) -> some View {
    content
      .swipeActions(edge: .leading) {
        KnownWordMenuButton(item: item, identifierPrefix: identifierPrefix)
          .tint(wordKnowledge.isKnown(item) ? .orange : .green)
      }
      .contextMenu {
        KnownWordMenuButton(item: item, identifierPrefix: identifierPrefix)
      }
  }
}

extension View {
  func knownWordActions(_ item: SavedItem, identifierPrefix: String) -> some View {
    modifier(KnownWordActions(item: item, identifierPrefix: identifierPrefix))
  }
}

struct KnownWordBadge: View {
  var announces = false

  var body: some View {
    HStack(spacing: 3) {
      Image(systemName: "checkmark")
      Text("Known")
    }
    .font(.caption.weight(.semibold))
    .foregroundStyle(.green)
    .padding(.horizontal, 8)
    .padding(.vertical, 3)
    .background(.green.opacity(0.15), in: .capsule)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Known")
    .accessibilityHidden(!announces)
  }
}

struct KnownWordsView: View {
  @Environment(WordKnowledge.self) private var wordKnowledge
  @State private var searchText = ""
  @State private var rows: KnowledgeRows?
  let lookupClient: LookupClient
  let openWord: (WordKnowledgeRecord) -> Void

  var body: some View {
    let records = filteredRecords
    Group {
      if !wordKnowledge.isLoaded || (rows == nil && wordKnowledge.knownCount > 0) {
        ProgressView("Loading Known Words")
          .accessibilityIdentifier("known-words.loading")
      } else if wordKnowledge.knownCount == 0 {
        ContentUnavailableView(
          "No Known Words",
          systemImage: "checkmark.circle",
          description: Text(
            readOnlyMessage
              ?? "Words and kanji you mark as known on their pages will appear here.")
        )
        .accessibilityIdentifier("known-words.empty")
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
                .accessibilityIdentifier("known-words.read-only")
            }
          }
        }
        .listStyle(.plain)
        .overlay {
          if records.isEmpty {
            ContentUnavailableView.search(text: searchText)
          }
        }
        .searchable(text: $searchText, prompt: "Search known words")
        .accessibilityIdentifier("known-words.list")
      }
    }
    .task(id: rowsRequest) {
      guard wordKnowledge.isLoaded else { return }
      let records = wordKnowledge.knownRecords
      rows = await KnowledgeRows.resolving(
        records,
        known: Set(records.map(\.entryID).filter(wordKnowledge.isKnown(storedID:))),
        using: lookupClient)
    }
    .navigationTitle("Known Words")
  }

  private var readOnlyMessage: LocalizedStringKey? {
    switch wordKnowledge.readOnlyReason {
    case .newerVersion:
      "Known words can’t be changed because they were saved by a newer version of Zenbu."
    case .couldNotKeepCopy:
      "Known words can’t be saved right now. Free up storage and reopen Zenbu."
    case .couldNotRead:
      "Known words couldn’t be loaded. Reopen Zenbu to try again."
    case nil:
      nil
    }
  }

  private var filteredRecords: [WordKnowledgeRecord] {
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return wordKnowledge.knownRecords }
    return wordKnowledge.knownRecords.filter {
      $0.headword.localizedStandardContains(query) || $0.reading.localizedStandardContains(query)
    }
  }

  private var rowsRequest: RowsRequest {
    RowsRequest(
      isLoaded: wordKnowledge.isLoaded, records: wordKnowledge.knownRecords,
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
  var isKnown = false

  var body: some View {
    HStack {
      JapaneseRubyText(
        ruby: JapaneseRuby(surface: headword, reading: reading),
        baseFont: .title3,
        rubyFont: .caption.weight(.semibold),
        highlightsKanjiOnTap: false
      )
      Spacer()
      if isKnown {
        KnownWordBadge()
      }
      if let date {
        Text(date, format: .dateTime.month().day())
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(headword), \(reading)")
    .accessibilityValue(isKnown ? Text("Known") : Text(""))
  }
}
