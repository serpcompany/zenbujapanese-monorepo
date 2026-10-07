import SwiftUI
import TranslatorCore

enum ConversationRow: Identifiable {
  case label(id: String, language: SpokenLanguage, isLive: Bool)
  case sentence(TranslatedSentence, language: SpokenLanguage)
  case live(LiveSentence)

  var id: String {
    switch self {
    case .label(let id, _, _): id
    case .sentence(let sentence, _): sentence.id.uuidString
    case .live: "live"
    }
  }

  @MainActor
  static func rows(for session: LiveConversation) -> [ConversationRow] {
    var rows: [ConversationRow] = []
    for turn in session.conversation.turns where !turn.sentences.isEmpty {
      rows.append(
        .label(id: "label.\(turn.id)", language: turn.language, isLive: turn.id == session.openTurnID))
      rows += turn.sentences.map { .sentence($0, language: turn.language) }
    }
    guard let live = session.liveSentence else { return rows }
    if session.openTurn?.language != live.language {
      rows.append(.label(id: "label.live", language: live.language, isLive: true))
    }
    rows.append(.live(live))
    return rows
  }
}

struct ConversationLanguageLabel: View {
  let language: SpokenLanguage
  let isLive: Bool

  var body: some View {
    HStack {
      Text(language.directionLabel)
      Spacer()
      if isLive { Text("live").foregroundStyle(.tint) }
    }
    .font(.caption.weight(.semibold))
    .foregroundStyle(.secondary)
    .padding(.horizontal, 12)
    .listRowSeparator(.hidden)
    .listRowBackground(Color.clear)
    .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 0, trailing: 16))
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

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if leadsWithTranslation {
        translation
        source.foregroundStyle(.secondary)
      } else {
        source
        translation.foregroundStyle(isSpeaking ? .primary : .secondary)
      }
      if isSpeaking {
        Label("Speaking \(language.counterpart.name)", systemImage: "waveform")
          .symbolEffect(.variableColor.iterative)
          .font(.caption.weight(.semibold))
          .foregroundStyle(.tint)
      }
    }
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("translate.sentence.\(sentence.id)")
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

struct ConversationStatusCard: View {
  let activity: ConversationActivity
  let resume: () -> Void

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: symbol)
        .foregroundStyle(.white)
        .frame(width: 30, height: 30)
        .background(tint, in: .rect(cornerRadius: 7))
      VStack(alignment: .leading, spacing: 4) {
        Text(title).font(.headline)
        Text(message).font(.subheadline).foregroundStyle(.secondary)
        Button(buttonTitle, action: resume)
          .font(.subheadline.weight(.semibold))
          .buttonStyle(.borderless)
          .accessibilityIdentifier("translate.status.resume")
      }
      Spacer(minLength: 0)
    }
    .padding(14)
    .background(.background.secondary, in: .rect(cornerRadius: 16))
    .listRowSeparator(.hidden)
    .listRowBackground(Color.clear)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("translate.status")
  }

  private var symbol: String {
    switch activity {
    case .paused(.silence), .paused(.background): "moon.fill"
    case .failed: "exclamationmark.triangle.fill"
    default: "mic.slash.fill"
    }
  }

  private var tint: Color {
    switch activity {
    case .paused(.silence), .paused(.background): .indigo
    case .failed: .orange
    default: .gray
    }
  }

  private var title: String {
    switch activity {
    case .paused(.silence): String(localized: "Paused after 3 minutes of silence")
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
