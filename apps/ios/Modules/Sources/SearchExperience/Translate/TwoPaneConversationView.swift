import SwiftUI
import TranslatorCore

struct TwoPaneConversationView: View {
  let session: LiveConversation
  let words: TranslateWordLinks

  var body: some View {
    VStack(spacing: 8) {
      ConversationPane(language: .japanese, lines: lines(in: .japanese), words: words)
        .background(SystemColor.secondaryBackground, in: .rect(cornerRadius: 6))
        .environment(\.colorScheme, .dark)
      ConversationPane(language: .english, lines: lines(in: .english), words: words)
        .background(SystemColor.secondaryBackground, in: .rect(cornerRadius: 6))
        .environment(\.colorScheme, .light)
    }
    .padding(.horizontal, 12)
  }

  private func lines(in language: SpokenLanguage) -> [PaneLine] {
    var lines: [PaneLine] = []
    for turn in session.conversation.turns {
      for sentence in turn.sentences {
        let isSource = turn.language == language
        guard let text = isSource ? sentence.text : sentence.translation else { continue }
        lines.append(
          PaneLine(
            id: sentence.id.uuidString, text: text, style: .finished,
            isSpeaking: !isSource && session.speakingSentenceID == sentence.id))
      }
    }
    if let live = session.liveSentence {
      if live.language == language {
        lines.append(PaneLine(id: "live", text: live.text, style: .live, isSpeaking: false))
      } else if let provisional = live.provisionalTranslation {
        lines.append(PaneLine(id: "live", text: provisional, style: .provisional, isSpeaking: false))
      }
    }
    return lines
  }
}

struct PaneLine: Identifiable, Equatable {
  enum Style: Equatable {
    case finished
    case live
    case provisional
  }

  let id: String
  let text: String
  let style: Style
  let isSpeaking: Bool
}

private struct ConversationPane: View {
  private struct LiveWords {
    let text: String
    let tokens: [JapaneseTextToken]
  }

  let language: SpokenLanguage
  let lines: [PaneLine]
  let words: TranslateWordLinks
  @State private var live: LiveWords?
  @State private var shownLines: [PaneLine]?

  var body: some View {
    let current = currentLines
    let ready = current.allSatisfy { shown($0) != nil }
    let displayed = ready ? current : shownLines ?? current.filter { shown($0) != nil }
    ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 10) {
          ForEach(displayed) { line in
            lineView(line, isNewest: line.id == displayed.last?.id).id(line.id)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
      }
      .defaultScrollAnchor(.bottom)
      .onChange(of: displayed) {
        guard let last = displayed.last else { return }
        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(language.name)
    .accessibilityIdentifier("translate.pane.\(language.rawValue)")
    .onChange(of: ready ? current : nil, initial: true) { _, linked in
      if let linked { shownLines = linked }
    }
    .onChange(of: liveText) { previous, _ in
      if previous == nil { live = nil }
    }
    .task(id: liveText) { await link(liveText) }
  }

  private var currentLines: [PaneLine] {
    lines.compactMap { line in
      guard line.style == .live, language == .japanese else { return line }
      return live.map {
        PaneLine(id: line.id, text: $0.text, style: .live, isSpeaking: line.isSpeaking)
      }
    }
  }

  private var liveText: String? {
    guard language == .japanese else { return nil }
    return lines.first { $0.style == .live }?.text
  }

  private func link(_ text: String?) async {
    guard let text, let tokens = await words.analysisClient.linkedTexts([text], nil)?.first,
      !Task.isCancelled
    else { return }
    live = LiveWords(text: text, tokens: tokens)
  }

  private func shown(_ line: PaneLine) -> ShownText? {
    switch line.style {
    case .provisional: .plain
    case .finished: words.shown(line.text, in: language)
    case .live:
      language != .japanese ? .plain : live.flatMap { $0.text == line.text ? .linked($0.tokens) : nil }
    }
  }

  @ViewBuilder
  private func lineView(_ line: PaneLine, isNewest: Bool) -> some View {
    Group {
      switch line.style {
      case .finished, .live:
        if let shown = shown(line) {
          TranslateLinkedText(
            text: line.text, shown: shown,
            identifier: "translate.pane.\(language.rawValue).\(line.id)", words: words)
        }
      case .provisional:
        Text(line.text + "…").italic()
      }
    }
    .fontWeight(isNewest ? .semibold : .regular)
    .foregroundStyle(isNewest || line.isSpeaking ? .primary : .secondary)
    .padding(.horizontal, line.isSpeaking ? 6 : 0)
    .background(
      line.isSpeaking ? AnyShapeStyle(.tint.opacity(0.25)) : AnyShapeStyle(.clear),
      in: .rect(cornerRadius: 4))
  }
}
