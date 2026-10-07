import SwiftUI
import TranslatorCore

enum ConversationRow: Identifiable {
  case sentence(TranslatedSentence, language: SpokenLanguage, startsTurn: Bool)
  case live(LiveSentence, startsTurn: Bool)

  var id: String {
    switch self {
    case .sentence(let sentence, _, _): sentence.id.uuidString
    case .live: "live"
    }
  }

  var startsTurn: Bool {
    switch self {
    case .sentence(_, _, let startsTurn), .live(_, let startsTurn): startsTurn
    }
  }

  @MainActor
  static func rows(for session: LiveConversation) -> [ConversationRow] {
    var rows: [ConversationRow] = []
    for turn in session.conversation.turns {
      let followsAnotherTurn = !rows.isEmpty
      rows += turn.sentences.enumerated().map { index, sentence in
        .sentence(sentence, language: turn.language, startsTurn: index == 0 && followsAnotherTurn)
      }
    }
    guard let live = session.liveSentence else { return rows }
    rows.append(.live(live, startsTurn: session.openTurn?.language != live.language && !rows.isEmpty))
    return rows
  }
}

struct SentenceCard: View {
  let sentence: TranslatedSentence
  let language: SpokenLanguage
  let leadsWithTranslation: Bool
  let isTranslating: Bool
  let isUntranslated: Bool
  let isSpeaking: Bool
  let words: TranslateWordLinks
  var replay: (() -> Void)?
  var bookmark: Binding<Bool>?

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      if leadsWithTranslation {
        translation
        separator
        source.foregroundStyle(.secondary)
      } else {
        source
        separator
        translation.foregroundStyle(isSpeaking ? .primary : .secondary)
      }
      if replay != nil || bookmark != nil { actions }
    }
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .accessibilityValue(isSpeaking ? Text("Speaking \(language.counterpart.name)") : Text(""))
    .accessibilityIdentifier("translate.sentence.\(sentence.id)")
  }

  private var separator: some View {
    Rectangle()
      .fill(.separator)
      .frame(maxWidth: .infinity)
      .frame(height: 1)
  }

  private var actions: some View {
    HStack(spacing: 20) {
      Spacer()
      if let replay {
        Button("Play Translation", systemImage: "speaker.wave.2", action: replay)
          .disabled(sentence.translation == nil)
          .accessibilityIdentifier("translate.sentence.\(sentence.id).replay")
      }
      if let bookmark {
        Button(
          bookmark.wrappedValue ? "Remove Bookmark" : "Bookmark",
          systemImage: bookmark.wrappedValue ? "bookmark.fill" : "bookmark"
        ) { bookmark.wrappedValue.toggle() }
        .foregroundStyle(bookmark.wrappedValue ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
        .accessibilityAddTraits(bookmark.wrappedValue ? .isSelected : [])
        .accessibilityIdentifier("translate.sentence.\(sentence.id).bookmark")
      }
    }
    .labelStyle(.iconOnly)
    .buttonStyle(.borderless)
    .foregroundStyle(.secondary)
  }

  private var source: some View {
    TranslateLinkedText(
      text: sentence.text, language: language,
      identifier: "translate.sentence.\(sentence.id).source", words: words)
  }

  @ViewBuilder
  private var translation: some View {
    if let translated = sentence.translation {
      TranslateLinkedText(
        text: translated, language: language.counterpart,
        identifier: "translate.sentence.\(sentence.id).translation", words: words)
    } else if isUntranslated {
      Text("Couldn't translate this sentence.")
        .font(.callout)
        .foregroundStyle(.tertiary)
    } else if isTranslating {
      Text("Translating…")
        .font(.callout)
        .italic()
        .foregroundStyle(.tertiary)
    }
  }
}

struct LiveSentenceCard: View {
  let sentence: LiveSentence
  let leadsWithTranslation: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if leadsWithTranslation {
        provisional
        heard.foregroundStyle(.secondary)
      } else {
        heard
        provisional
      }
    }
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("translate.live")
  }

  private var heard: some View {
    Text("\(sentence.text) \(Text("▍").foregroundStyle(.tint))")
      .fixedSize(horizontal: false, vertical: true)
  }

  @ViewBuilder
  private var provisional: some View {
    if let preview = sentence.provisionalTranslation {
      Text(preview.trimmingCharacters(in: .punctuationCharacters.union(.whitespaces)) + "…")
        .font(.callout)
        .italic()
        .foregroundStyle(.tertiary)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

struct ConversationStatusAlert: ViewModifier {
  let session: LiveConversation
  @State private var explained: ConversationActivity?

  func body(content: Content) -> some View {
    content
      .onChange(of: session.activity) { _, activity in
        explained = activity.needsExplaining ? activity : nil
      }
      .alert(title, isPresented: isPresented, presenting: explained) { _ in
        Button(buttonTitle) { session.start() }
          .accessibilityIdentifier("translate.status.resume")
        Button("Not Now", role: .cancel) {}
      } message: { _ in
        Text(message)
      }
  }

  private var activity: ConversationActivity { explained ?? .listening }

  private var isPresented: Binding<Bool> {
    Binding(get: { explained != nil }, set: { if !$0 { explained = nil } })
  }

  private var title: String {
    switch activity {
    case .paused(.silence): String(localized: "Paused after \(session.timing.silenceLength) of silence")
    case .paused(.background): String(localized: "Paused while you were away")
    case .failed: String(localized: "Listening stopped")
    default: String(localized: "Paused")
    }
  }

  private var message: String {
    switch activity {
    case .paused(.silence):
      String(localized: "Nobody answered “Are you still there?”, so the microphone turned off.")
    case .paused(.background):
      String(localized: "Translate went to the background, so the microphone turned off.")
    case .failed(let failure): failure.message
    default: String(localized: "The microphone is off.")
    }
  }

  private var buttonTitle: String {
    if case .failed = activity { return String(localized: "Try Again") }
    return String(localized: "Resume")
  }
}

struct OneSizeLargerText: ViewModifier {
  @Environment(\.dynamicTypeSize) private var size

  func body(content: Content) -> some View {
    let sizes = DynamicTypeSize.allCases
    let index = sizes.firstIndex(of: size).map { min($0 + 1, sizes.count - 1) }
    content.dynamicTypeSize(index.map { sizes[$0] } ?? size)
  }
}
