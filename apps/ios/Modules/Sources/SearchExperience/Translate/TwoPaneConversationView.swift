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
  let language: SpokenLanguage
  let lines: [PaneLine]
  let words: TranslateWordLinks

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 10) {
          ForEach(lines) { line in
            lineView(line, isNewest: line.id == lines.last?.id).id(line.id)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
      }
      .defaultScrollAnchor(.bottom)
      .onChange(of: lines) {
        guard let last = lines.last else { return }
        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(language.name)
    .accessibilityIdentifier("translate.pane.\(language.rawValue)")
  }

  @ViewBuilder
  private func lineView(_ line: PaneLine, isNewest: Bool) -> some View {
    Group {
      switch line.style {
      case .finished, .live:
        TranslateLinkedText(
          text: line.text, language: language,
          identifier: "translate.pane.\(language.rawValue).\(line.id)", words: words)
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
