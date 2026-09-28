import SwiftUI

/// The Word Detail menu item that marks a word known or unknown.
struct KnownWordMenuButton: View {
  @Environment(WordKnowledge.self) private var wordKnowledge
  let entry: DictionaryEntry
  /// The accessibility identifier prefix of the screen showing the button.
  var identifierPrefix = "word-detail"

  var body: some View {
    let isKnown = wordKnowledge.isKnown(entry.id)
    Button(
      isKnown ? "Mark as Unknown" : "Mark as Known",
      systemImage: isKnown ? "xmark.circle" : "checkmark.circle"
    ) {
      wordKnowledge.toggleKnown(entry)
    }
    .disabled(!wordKnowledge.isLoaded)
    .accessibilityIdentifier("\(identifierPrefix).\(isKnown ? "mark-unknown" : "mark-known")")
  }
}

/// The capsule Search results and Word Detail show for a known word.
struct KnownWordBadge: View {
  /// Off where the surrounding row already says "Known" to VoiceOver.
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

/// Account → Known Words: every word the learner marked known, most recent first.
struct KnownWordsView: View {
  @Environment(WordKnowledge.self) private var wordKnowledge
  @State private var searchText = ""
  let openWord: (WordKnowledgeRecord) -> Void

  var body: some View {
    let records = filteredRecords
    Group {
      if !wordKnowledge.isLoaded {
        ProgressView()
      } else if wordKnowledge.knownCount == 0 {
        ContentUnavailableView(
          "No Known Words",
          systemImage: "checkmark.circle",
          description: Text("Words you mark as known in Search or on a word’s page will appear here.")
        )
        .accessibilityIdentifier("known-words.empty")
      } else {
        List {
          ForEach(records) { record in
            Button {
              openWord(record)
            } label: {
              KnownWordsListRow(record: record)
            }
            .foregroundStyle(.primary)
            .accessibilityIdentifier("known-words.item.\(record.entryID)")
            .swipeActions {
              Button("Mark as Unknown", systemImage: "xmark.circle") {
                wordKnowledge.setStatus(.unknown, for: record)
              }
              .tint(.orange)
            }
          }
        }
        .overlay {
          if records.isEmpty {
            ContentUnavailableView.search(text: searchText)
          }
        }
        .searchable(text: $searchText, prompt: "Search known words")
        .accessibilityIdentifier("known-words.list")
      }
    }
    .navigationTitle("Known Words")
  }

  private var filteredRecords: [WordKnowledgeRecord] {
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return wordKnowledge.knownRecords }
    return wordKnowledge.knownRecords.filter {
      $0.headword.localizedStandardContains(query) || $0.reading.localizedStandardContains(query)
    }
  }

}

private struct KnownWordsListRow: View {
  let record: WordKnowledgeRecord

  var body: some View {
    HStack {
      JapaneseRubyText(
        surface: record.headword,
        reading: record.reading,
        baseFont: .title3,
        rubyFont: .caption.weight(.semibold)
      )
      Spacer()
      Text(record.updatedAt, format: .dateTime.month().day())
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(record.headword), \(record.reading)")
  }
}
