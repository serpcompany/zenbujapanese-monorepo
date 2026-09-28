import SwiftUI

/// The Word Detail and Kanji Detail menu item that marks a word or kanji known or unknown.
struct KnownWordMenuButton: View {
  @Environment(WordKnowledge.self) private var wordKnowledge
  let item: SavedItem
  /// The accessibility identifier prefix of the screen showing the button.
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

/// Account → Known Words: every word and kanji the learner marked known, most recent first.
struct KnownWordsView: View {
  @Environment(WordKnowledge.self) private var wordKnowledge
  @State private var searchText = ""
  let openWord: (WordKnowledgeRecord) -> Void

  var body: some View {
    let records = filteredRecords
    Group {
      if !wordKnowledge.isLoaded {
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
              Button {
                openWord(record)
              } label: {
                SavedWordRow(
                  headword: record.headword, reading: record.reading, date: record.updatedAt)
              }
              .foregroundStyle(.primary)
              .accessibilityIdentifier("known-words.item.\(record.entryID)")
              .swipeActions {
                if !wordKnowledge.isReadOnly {
                  Button("Mark as Unknown", systemImage: "xmark.circle") {
                    wordKnowledge.setStatus(.unknown, for: record)
                  }
                  .tint(.orange)
                }
              }
            }
          } footer: {
            if let readOnlyMessage {
              Text(readOnlyMessage)
                .accessibilityIdentifier("known-words.read-only")
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

}

/// A saved word in Known Words or a list: its headword with furigana, the Known capsule when
/// asked for, and when it was saved.
struct SavedWordRow: View {
  let headword: String
  let reading: String
  let date: Date
  var isKnown = false

  var body: some View {
    HStack {
      JapaneseRubyText(
        surface: headword,
        reading: reading,
        baseFont: .title3,
        rubyFont: .caption.weight(.semibold)
      )
      Spacer()
      if isKnown {
        KnownWordBadge()
      }
      Text(date, format: .dateTime.month().day())
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(headword), \(reading)")
    .accessibilityValue(isKnown ? Text("Known") : Text(""))
  }
}
