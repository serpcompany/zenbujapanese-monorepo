import SwiftUI
import TranslatorCore
import UIKit

struct TranscriptActions {
  let words: TranslateWordLinks
  let readingAids: ReadingAidPreferences
  let conversationWords: ConversationWords
  let speak: (String, SpokenLanguage) -> Void

  @MainActor
  func comprehension(of conversation: Conversation, isKnown: (LanguageReferenceID) -> Bool)
    -> Comprehension?
  {
    conversationWords.comprehension(
      of: conversation, analysis: words.analysisClient, isKnown: isKnown)
  }
}

struct TranscriptSentence: View {
  let sentence: TranslatedSentence
  let language: SpokenLanguage
  let conversationID: UUID
  let history: ConversationHistory
  let actions: TranscriptActions

  var body: some View {
    SentenceCard(
      sentence: sentence,
      language: language,
      leadsWithTranslation: false,
      isTranslating: false,
      isUntranslated: sentence.translation == nil,
      isSpeaking: false,
      words: actions.words,
      replay: {
        guard let translation = sentence.translation else { return }
        actions.speak(translation, language.counterpart)
      },
      bookmark: Binding(
        get: { sentence.isBookmarked },
        set: { history.setBookmarked($0, sentence: sentence.id, in: conversationID) })
    )
    .modifier(OneSizeLargerText())
    .environment(actions.readingAids)
  }
}

struct TranslateConversationDetailView: View {
  let conversationID: UUID
  let history: ConversationHistory
  let actions: TranscriptActions
  @Environment(\.dismiss) private var dismiss
  @Environment(WordKnowledge.self) private var wordKnowledge
  @State private var isConfirmingDelete = false

  var body: some View {
    if let conversation = history.conversation(conversationID) {
      transcript(conversation)
    } else {
      ContentUnavailableView("Conversation Deleted", systemImage: "trash")
    }
  }

  private func header(_ conversation: Conversation) -> some View {
    let summary =
      "\(conversation.durationLabel) · \(conversation.turnCountLabel) · \(conversation.mode.title)"
    let known = actions.comprehension(of: conversation, isKnown: wordKnowledge.isKnown)?
      .percentText
    return Text(known.map { summary + " · " + String(localized: "\($0) known") } ?? summary)
      .accessibilityIdentifier("translate.detail.summary")
  }

  private func transcript(_ conversation: Conversation) -> some View {
    List {
      ForEach(Array(conversation.turns.enumerated()), id: \.element.id) { index, turn in
        Section {
          ForEach(turn.sentences) { sentence in
            TranscriptSentence(
              sentence: sentence, language: turn.language, conversationID: conversation.id,
              history: history, actions: actions)
          }
        } header: {
          if index == 0 { header(conversation) }
        }
      }
    }
    .listStyle(.insetGrouped)
    .listSectionSpacing(.compact)
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
