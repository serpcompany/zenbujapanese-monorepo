import SwiftUI
import TranslatorCore

struct LiveConversationView: View {
  private static let bottomID = "translate.conversation.bottom"

  let session: LiveConversation
  let experience: TranslateExperience
  let words: TranslateWordLinks
  let isOnScreen: Bool
  @State private var isFollowingLatest = true
  @State private var heldRows = ConversationRowFloor()
  @State private var shownRows: [ConversationRow]?
  @State private var isConfirmingExit = false
  @State private var wasListeningBeforeExit = false

  var body: some View {
    VStack(spacing: 0) {
      Group {
        switch experience.layout {
        case .cards: cards
        case .twoPanes: TwoPaneConversationView(session: session, words: words).padding(.top, 8)
        }
      }
      .modifier(OneSizeLargerText())
      .environment(experience.readingAids)
      .frame(maxHeight: .infinity)
      ConversationControlBar(session: session, experience: experience)
        .dynamicTypeSize(...DynamicTypeSize.large)
    }
    .task { _ = await words.analysisClient.availability() }
    .onChange(of: session.conversation.spokenSentences.map(\.sentence), initial: true) {
      words.request(session.conversation.spokenSentences)
    }
    .tabBarVisibility(
      TranslateChromeLayout(isSessionLive: true, isConversationOnScreen: isOnScreen).tabBar)
    .modifier(ConversationStatusAlert(session: session))
    .alert("Leave this conversation?", isPresented: $isConfirmingExit) {
      Button("Save and Exit") { leave(saving: true) }
      Button("Exit Without Saving", role: .destructive) { leave(saving: false) }
      Button("Cancel", role: .cancel) {}
    } message: {
      Text("Save its \(session.conversation.turnCountLabel) to Translations, or leave without saving.")
    }
    .inlineNavigationTitle()
    .backButtonHidden()
    .toolbar {
      ToolbarItem(placement: .barLeading) {
        Button("Back", systemImage: "chevron.backward", action: requestExit)
          .accessibilityIdentifier("translate.conversation.back")
      }
      ToolbarItem(placement: .barTrailing) { optionsMenu }
    }
    .onChange(of: isConfirmingExit) { _, isConfirming in
      guard !isConfirming, experience.session === session, session.status == .paused(.leaving)
      else { return }
      if wasListeningBeforeExit { session.start() }
    }
  }

  private var cards: some View {
    let current = ConversationRow.rows(for: session)
    let ready = current.allSatisfy(isShown)
    let rows = ready ? current : shownRows ?? current.filter(isShown)
    let showsPrompt =
      session.conversation.turns.isEmpty && session.liveSentence == nil && session.isLive
    let rowCount = rows.count + (showsPrompt ? 1 : 0)
    let conversation = ObjectIdentifier(session)
    return ScrollViewReader { proxy in
      List {
        ForEach(rows) { row in
          rowView(row).id(row.id)
        }
        if showsPrompt {
          emptyPrompt
        }
        ForEach(0..<heldRows.placeholders(for: rowCount, of: conversation), id: \.self) { _ in
          blankRow
        }
        blankRow.id(Self.bottomID)
      }
      .listStyle(.plain)
      .contentMargins(.top, 8, for: .scrollContent)
      .onScrollGeometryChange(for: ConversationScrollPosition.self) { geometry in
        ConversationScrollPosition(
          offset: geometry.contentOffset.y, visibleHeight: geometry.containerSize.height,
          contentHeight: geometry.contentSize.height)
      } action: { earlier, position in
        isFollowingLatest = position.keepsFollowing(isFollowingLatest, after: earlier)
      }
      .onChange(of: rowCount, initial: true) {
        heldRows.hold(rowCount, of: conversation)
      }
      .onChange(of: ready ? current : nil, initial: true) { _, linked in
        if let linked { shownRows = linked }
      }
      .onChange(of: contentVersion(of: rows)) {
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
  }

  private var blankRow: some View {
    Color.clear
      .frame(height: 1)
      .listRowSeparator(.hidden)
      .listRowBackground(Color.clear)
      .accessibilityHidden(true)
  }

  @ViewBuilder
  private func rowView(_ row: ConversationRow) -> some View {
    let gap: CGFloat = row.startsTurn ? 14 : 0
    switch row {
    case .sentence(let sentence, let language, _):
      SentenceCard(
        sentence: sentence,
        language: language,
        leadsWithTranslation: session.mode == .listening,
        isTranslating: session.translatingSentenceIDs.contains(sentence.id),
        isUntranslated: session.untranslatedSentenceIDs.contains(sentence.id),
        isSpeaking: session.speakingSentenceID == sentence.id,
        words: words
      )
      .captionCardRow(
        isActive: session.speakingSentenceID == sentence.id, cornerRadius: 6, gapAbove: gap)
    case .live(let live, _):
      LiveSentenceCard(sentence: live, leadsWithTranslation: session.mode == .listening)
        .captionCardRow(isActive: true, cornerRadius: 6, gapAbove: gap)
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

  private var optionsMenu: some View {
    Menu("Options", systemImage: "ellipsis") {
      Picker("Layout", selection: layout) {
        Label("Cards", systemImage: "rectangle.grid.1x2").tag(ConversationLayout.cards)
        Label("Two Panes", systemImage: "rectangle.split.1x2").tag(ConversationLayout.twoPanes)
      }
      .pickerStyle(.inline)
      FuriganaToggle(readingAids: experience.readingAids)
    }
    .accessibilityIdentifier("translate.conversation.options")
  }

  private var layout: Binding<ConversationLayout> {
    Binding(get: { experience.layout }, set: { experience.layout = $0 })
  }

  private func leave(saving: Bool) {
    wasListeningBeforeExit = false
    Task { await experience.leave(saving: saving) }
  }

  private func isShown(_ row: ConversationRow) -> Bool {
    guard case .sentence(let sentence, let language, _) = row else { return true }
    return words.shown(sentence.text, in: language) != nil
  }

  private func contentVersion(of rows: [ConversationRow]) -> String {
    var translated = 0
    var live = -1
    for row in rows {
      switch row {
      case .sentence(let sentence, let language, _):
        if let translation = sentence.translation,
          words.shown(translation, in: language.counterpart) != nil
        {
          translated += 1
        }
      case .live(let sentence, _): live = sentence.text.count
      }
    }
    return "\(rows.count).\(translated).\(live).\(session.status)"
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
