import SwiftUI
import TranslatorCore

struct TranscriptActions {
  let words: TranslateWordLinks
  let readingAids: ReadingAidPreferences
  let conversationWords: ConversationWords
  let speak: ((String, SpokenLanguage) -> Void)?

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
  let conversationID: UUID?
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
      replay: actions.speak.map { speak in
        {
          guard let translation = sentence.translation else { return }
          speak(translation, language.counterpart)
        }
      },
      bookmark: Binding(
        get: { sentence.isBookmarked },
        set: { history.setBookmarked($0, sentence: sentence.id, in: conversationID) })
    )
    .modifier(OneSizeLargerText())
    .environment(actions.readingAids)
  }
}

extension TranscriptActions {
  @MainActor
  func isReady(_ sentence: TranslatedSentence, spokenIn language: SpokenLanguage) -> Bool {
    words.texts.isReady(sentence, spokenIn: language)
  }
}

struct TranslateConversationDetailView: View {
  let conversationID: UUID
  let history: ConversationHistory
  let actions: TranscriptActions
  @Environment(\.dismiss) private var dismiss
  @Environment(WordKnowledge.self) private var wordKnowledge
  @Environment(\.exampleRowsOnScreen) private var rowsOnScreen
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
      ForEach(Array(shownTurns(of: conversation).enumerated()), id: \.element.turn.id) {
        index, shown in
        Section {
          ForEach(shown.sentences) { sentence in
            TranscriptSentence(
              sentence: sentence, language: shown.turn.language, conversationID: conversation.id,
              history: history, actions: actions)
          }
        } header: {
          if index == 0 { header(conversation) }
        }
      }
    }
    .onChange(of: conversation.spokenSentences.map(\.sentence), initial: true) {
      let sentences = conversation.spokenSentences
      actions.words.request(Array(sentences.prefix(rowsOnScreen ?? LinkedLines.laterPage)))
      actions.words.request(sentences)
    }
    .groupedList()
    .compactSectionSpacing()
    .navigationTitle(ConversationDateLabel.text(for: conversation.startedAt))
    .inlineNavigationTitle()
    .toolbar {
      ToolbarItem(placement: .barTrailing) {
        Menu("More", systemImage: "ellipsis") {
          FuriganaToggle(readingAids: actions.readingAids)
          Divider()
          Button("Copy Transcript", systemImage: "doc.on.doc") {
            Pasteboard.copy(conversation.transcript)
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

  private func shownTurns(of conversation: Conversation)
    -> [(turn: ConversationTurn, sentences: [TranslatedSentence])]
  {
    var shown: [(turn: ConversationTurn, sentences: [TranslatedSentence])] = []
    for turn in conversation.turns {
      let ready = Array(turn.sentences.prefix { actions.isReady($0, spokenIn: turn.language) })
      if !ready.isEmpty || shown.isEmpty { shown.append((turn, ready)) }
      guard ready.count == turn.sentences.count else { break }
    }
    return shown
  }
}
