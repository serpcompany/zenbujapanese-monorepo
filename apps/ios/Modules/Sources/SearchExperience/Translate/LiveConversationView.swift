import SwiftUI
import TranslatorCore

struct LiveConversationView: View {
  private static let bottomID = "translate.conversation.bottom"

  let session: LiveConversation
  let experience: TranslateExperience
  let words: TranslateWordLinks
  @State private var isFollowingLatest = true
  @State private var isConfirmingExit = false
  @State private var wasListeningBeforeExit = false
  @State private var isChoosingMode = false

  var body: some View {
    ScrollViewReader { proxy in
      List {
        ForEach(ConversationRow.rows(for: session)) { row in
          rowView(row).id(row.id)
        }
        if session.activity.needsExplaining {
          ConversationStatusCard(activity: session.activity) { session.start() }
        }
        if session.conversation.turns.isEmpty, session.liveSentence == nil, session.isLive {
          emptyPrompt
        }
        Color.clear
          .frame(height: 1)
          .listRowSeparator(.hidden)
          .listRowBackground(Color.clear)
          .id(Self.bottomID)
      }
      .listStyle(.plain)
      .contentMargins(.top, 8, for: .scrollContent)
      .onScrollGeometryChange(for: Bool.self) { geometry in
        geometry.contentOffset.y + geometry.containerSize.height
          >= geometry.contentSize.height - 60
      } action: { _, isNearBottom in
        isFollowingLatest = isNearBottom
      }
      .onChange(of: contentVersion) {
        guard isFollowingLatest else { return }
        withAnimation { proxy.scrollTo(Self.bottomID, anchor: .bottom) }
      }
      .overlay(alignment: .bottom) {
        if !isFollowingLatest {
          Button("Jump to Latest", systemImage: "arrow.down") {
            isFollowingLatest = true
            withAnimation { proxy.scrollTo(Self.bottomID, anchor: .bottom) }
          }
          .buttonStyle(.glass)
          .padding(.bottom, 12)
          .accessibilityIdentifier("translate.jump-to-latest")
        }
      }
    }
    .navigationTitle(session.mode.languagePair)
    .navigationBarTitleDisplayMode(.inline)
    .navigationBarBackButtonHidden()
    .toolbarTitleMenu { conversationMenu }
    .sheet(isPresented: $isChoosingMode) {
      LiveModesSheet(selection: session.mode, confirmTitle: String(localized: "Done")) { mode in
        Task { await experience.switchMode(to: mode) }
      }
    }
    .toolbar {
      ToolbarItem(placement: .topBarLeading) {
        Button("Back", systemImage: "chevron.backward", action: requestExit)
          .accessibilityIdentifier("translate.conversation.back")
          .confirmationDialog(
            "Leave this conversation?", isPresented: $isConfirmingExit, titleVisibility: .visible
          ) {
            Button("Save and Exit") { leave(saving: true) }
            Button("Exit Without Saving", role: .destructive) { leave(saving: false) }
            Button("Cancel", role: .cancel) {}
          } message: {
            Text("Save its \(session.conversation.turnCountLabel) to History, or leave without saving.")
          }
      }
      ToolbarItem(placement: .topBarTrailing) { ConversationTimerControl(session: session) }
    }
    .onChange(of: isConfirmingExit) { _, isConfirming in
      guard !isConfirming, experience.session === session, session.status == .paused(.leaving)
      else { return }
      if wasListeningBeforeExit { session.start() }
    }
  }

  @ViewBuilder
  private func rowView(_ row: ConversationRow) -> some View {
    switch row {
    case .label(_, let language, let isLive):
      ConversationLanguageLabel(language: language, isLive: isLive)
    case .sentence(let sentence, let language):
      SentenceCard(
        sentence: sentence,
        language: language,
        leadsWithTranslation: session.mode == .listening,
        isTranslating: session.translatingSentenceIDs.contains(sentence.id),
        isUntranslated: session.untranslatedSentenceIDs.contains(sentence.id),
        isSpeaking: session.speakingSentenceID == sentence.id,
        words: words
      )
      .captionCardRow(isActive: session.speakingSentenceID == sentence.id)
    case .live(let live):
      LiveSentenceCard(sentence: live, leadsWithTranslation: session.mode == .listening)
        .captionCardRow(isActive: true)
    }
  }

  private var emptyPrompt: some View {
    VStack(spacing: 8) {
      Image(systemName: session.mode.systemImage)
        .font(.largeTitle)
        .foregroundStyle(.tint)
        .symbolEffect(.pulse)
      Text(session.mode.startHint)
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 40)
    .listRowSeparator(.hidden)
    .listRowBackground(Color.clear)
  }

  @ViewBuilder
  private var conversationMenu: some View {
    if session.mode != .listening {
      Toggle(isOn: playsAloud) {
        Label("Play Translations Aloud", systemImage: "speaker.wave.2")
      }
      .accessibilityIdentifier("translate.conversation.plays-aloud")
    }
    Button("Change Mode…", systemImage: session.mode.systemImage) { isChoosingMode = true }
  }

  private var playsAloud: Binding<Bool> {
    Binding(
      get: { session.mode == .conversation },
      set: { plays in Task { await experience.switchMode(to: plays ? .conversation : .textOnly) } }
    )
  }

  private func leave(saving: Bool) {
    wasListeningBeforeExit = false
    Task { await experience.leave(saving: saving) }
  }

  private var contentVersion: String {
    let sentences = session.conversation.turns.reduce(0) { $0 + $1.sentences.count }
    let translated = session.conversation.sentences.filter { $0.translation != nil }.count
    return "\(sentences).\(translated).\(session.liveSentence?.text.count ?? -1).\(session.status)"
  }

  private func requestExit() {
    guard session.hasSentences else {
      Task { await experience.leave(saving: false) }
      return
    }
    wasListeningBeforeExit = session.isLive
    session.pause(.leaving)
    isConfirmingExit = true
  }
}
