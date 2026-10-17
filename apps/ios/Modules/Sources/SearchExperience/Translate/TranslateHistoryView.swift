import SwiftUI
import TranslatorCore

enum HistoryFilter: Hashable {
  case all
  case bookmarked
}

struct TranslateHistoryView: View {
  @Bindable var history: ConversationHistory
  let transcript: TranscriptActions
  @State private var query = ""
  @State private var filter = HistoryFilter.all
  @Environment(WordKnowledge.self) private var wordKnowledge
  @State private var pendingDeletion: Conversation?
  @State private var isConfirmingDeleteAll = false

  var body: some View {
    let results = history.search(query)
    List {
      Picker("Show", selection: $filter) {
        Text("All").tag(HistoryFilter.all)
        Label("Bookmarked", systemImage: "bookmark").tag(HistoryFilter.bookmarked)
      }
      .pickerStyle(.segmented)
      .listRowInsets(EdgeInsets())
      .listRowBackground(Color.clear)
      .accessibilityIdentifier("translate.history.filter")
      if filter == .bookmarked {
        bookmarks
      } else {
        conversations(results)
      }
    }
    .groupedList()
    .overlay {
      if filter == .bookmarked, history.bookmarks.isEmpty, history.isLoaded {
        ContentUnavailableView(
          "No Bookmarks Yet", systemImage: "bookmark",
          description: Text("Bookmark a sentence in a saved conversation to find it here."))
      } else if filter == .all, results.isEmpty, history.isLoaded {
        if query.trimmingCharacters(in: .whitespaces).isEmpty {
          ContentUnavailableView(
            "No Conversations Yet", systemImage: "bubble.left.and.bubble.right",
            description: Text("Conversations you save appear here."))
        } else {
          ContentUnavailableView.search(text: query)
        }
      }
    }
    .searchable(text: $query, prompt: "Search Japanese or English")
    .minimizedSearchToolbar()
    .navigationTitle("Translations")
    .inlineNavigationTitle()
    .toolbar {
      ToolbarItem(placement: .barTrailing) { moreMenu }
    }
    .confirmationDialog(
      "Delete this conversation? This can't be undone.",
      isPresented: deletionBinding, titleVisibility: .visible, presenting: pendingDeletion
    ) { conversation in
      Button("Delete Conversation", role: .destructive) { history.delete(conversation.id) }
    }
    .confirmationDialog(
      "Delete all \(history.saved.count) conversations? This can't be undone.",
      isPresented: $isConfirmingDeleteAll, titleVisibility: .visible
    ) {
      Button("Delete All Conversations", role: .destructive) { history.deleteAll() }
    }
    .accessibilityIdentifier("translate.history")
  }

  private var bookmarks: some View {
    ForEach(history.bookmarks) { bookmark in
      TranscriptSentence(
        sentence: bookmark.sentence, language: bookmark.language,
        conversationID: bookmark.conversationID, history: history, actions: transcript)
    }
  }

  private func conversations(_ results: [Conversation]) -> some View {
    ForEach(results) { conversation in
      NavigationLink(value: TranslateRoute.conversation(conversation.id)) {
        HistoryRow(
          conversation: conversation,
          comprehension: transcript.comprehension(
            of: conversation, isKnown: wordKnowledge.isKnown))
      }
      .contextMenu {
        Button("Copy", systemImage: "doc.on.doc") {
          Pasteboard.copy(conversation.transcript)
        }
        ShareLink(item: conversation.transcript) {
          Label("Share", systemImage: "square.and.arrow.up")
        }
        Button("Delete", systemImage: "trash", role: .destructive) {
          pendingDeletion = conversation
        }
      }
      .accessibilityIdentifier("translate.history.row")
    }
  }

  private var moreMenu: some View {
    Menu("More", systemImage: "ellipsis") {
      Button("Delete All…", systemImage: "trash", role: .destructive) {
        isConfirmingDeleteAll = true
      }
      .disabled(history.saved.isEmpty)
    }
    .accessibilityIdentifier("translate.history.more")
  }

  private var deletionBinding: Binding<Bool> {
    Binding(get: { pendingDeletion != nil }, set: { if !$0 { pendingDeletion = nil } })
  }
}

private struct HistoryRow: View {
  let conversation: Conversation
  let comprehension: Comprehension?

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(conversation.firstSentence?.text ?? "")
        .lineLimit(1)
      Text(subtitle)
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .monospacedDigit()
    }
    .padding(.vertical, 2)
  }

  private var subtitle: String {
    let summary =
      "\(ConversationDateLabel.text(for: conversation.startedAt)) · \(conversation.turnCountLabel)"
    guard let percent = comprehension?.percentText else { return summary }
    return summary + " · " + String(localized: "\(percent) known")
  }
}

enum TranslateRoute: Hashable {
  case text(String)
  case history
  case conversation(UUID)
}
