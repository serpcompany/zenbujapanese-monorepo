import SwiftUI
import TranslatorCore
import UIKit

struct TranslateHistoryView: View {
  @Bindable var history: ConversationHistory
  @State private var query = ""
  @State private var pendingDeletion: Conversation?
  @State private var isConfirmingDeleteAll = false

  var body: some View {
    let results = history.search(query)
    List {
      ForEach(results) { conversation in
        NavigationLink(value: TranslateRoute.conversation(conversation.id)) {
          HistoryRow(conversation: conversation)
        }
        .contextMenu {
          Button("Copy", systemImage: "doc.on.doc") {
            UIPasteboard.general.string = conversation.transcript
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
    .listStyle(.insetGrouped)
    .overlay {
      if results.isEmpty, history.isLoaded {
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
    .searchToolbarBehavior(.minimize)
    .navigationTitle("History")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) { moreMenu }
    }
    .confirmationDialog(
      "Delete this conversation? This can't be undone.",
      isPresented: deletionBinding, titleVisibility: .visible, presenting: pendingDeletion
    ) { conversation in
      Button("Delete Conversation", role: .destructive) { history.delete(conversation.id) }
    }
    .confirmationDialog(
      "Delete all \(history.conversations.count) conversations? This can't be undone.",
      isPresented: $isConfirmingDeleteAll, titleVisibility: .visible
    ) {
      Button("Delete All Conversations", role: .destructive) { history.deleteAll() }
    }
    .accessibilityIdentifier("translate.history")
  }

  private var moreMenu: some View {
    Menu("More", systemImage: "ellipsis") {
      Picker(selection: $history.retention) {
        ForEach(HistoryRetention.allCases) { retention in
          Text(retention.title).tag(retention)
        }
      } label: {
        Label("Keep History", systemImage: "clock")
      }
      .pickerStyle(.menu)
      Divider()
      Button("Delete All…", systemImage: "trash", role: .destructive) {
        isConfirmingDeleteAll = true
      }
      .disabled(history.conversations.isEmpty)
    }
    .accessibilityIdentifier("translate.history.more")
  }

  private var deletionBinding: Binding<Bool> {
    Binding(get: { pendingDeletion != nil }, set: { if !$0 { pendingDeletion = nil } })
  }
}

private struct HistoryRow: View {
  let conversation: Conversation

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(conversation.firstSentence?.text ?? "")
        .lineLimit(1)
      Text("\(ConversationDateLabel.text(for: conversation.startedAt)) · \(conversation.turnCountLabel)")
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .monospacedDigit()
    }
    .padding(.vertical, 2)
  }
}

extension HistoryRetention {
  var title: String {
    switch self {
    case .thirtyDays: String(localized: "30 Days")
    case .oneYear: String(localized: "1 Year")
    case .forever: String(localized: "Forever")
    }
  }
}

struct TranslateConversationDetailView: View {
  let conversationID: UUID
  let history: ConversationHistory
  let words: TranslateWordLinks
  @Environment(\.dismiss) private var dismiss
  @State private var isConfirmingDelete = false

  var body: some View {
    if let conversation = history.conversation(conversationID) {
      transcript(conversation)
    } else {
      ContentUnavailableView("Conversation Deleted", systemImage: "trash")
    }
  }

  private func transcript(_ conversation: Conversation) -> some View {
    List {
      Section {
        ForEach(conversation.turns) { turn in
          ForEach(Array(turn.sentences.enumerated()), id: \.element.id) { index, sentence in
            VStack(alignment: .leading, spacing: 6) {
              if index == 0 {
                Text(turn.language.name.uppercased())
                  .font(.caption2.weight(.semibold))
                  .foregroundStyle(.secondary)
              }
              TranslateLinkedText(
                text: sentence.text, language: turn.language,
                identifier: "translate.detail.\(sentence.id)", words: words)
              TranslateLinkedText(
                text: sentence.translation ?? String(localized: "Not translated"),
                language: turn.language.counterpart,
                identifier: "translate.detail.\(sentence.id).translation", words: words
              )
              .foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)
          }
        }
      } header: {
        Text(
          "\(conversation.durationLabel) · \(conversation.turnCountLabel) · \(conversation.mode.title)"
        )
      } footer: {
        Text("Tap an underlined word to look it up.")
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle(ConversationDateLabel.text(for: conversation.startedAt))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Menu("More", systemImage: "ellipsis") {
          Button("Copy Transcript", systemImage: "doc.on.doc") {
            UIPasteboard.general.string = conversation.transcript
          }
          ShareLink(item: conversation.transcript) {
            Label("Share", systemImage: "square.and.arrow.up")
          }
          Divider()
          Button("Delete Conversation", systemImage: "trash", role: .destructive) {
            isConfirmingDelete = true
          }
        }
        .accessibilityIdentifier("translate.detail.more")
      }
    }
    .confirmationDialog(
      "Delete this conversation? This can't be undone.",
      isPresented: $isConfirmingDelete, titleVisibility: .visible
    ) {
      Button("Delete Conversation", role: .destructive) {
        history.delete(conversation.id)
        dismiss()
      }
    }
    .accessibilityIdentifier("translate.detail")
  }
}

enum TranslateRoute: Hashable {
  case history
  case conversation(UUID)
}
