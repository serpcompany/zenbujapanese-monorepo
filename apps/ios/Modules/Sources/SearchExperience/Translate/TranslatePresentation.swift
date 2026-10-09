import SwiftUI
import TranslatorCore

extension TranslateMode {
  var title: String {
    switch self {
    case .conversation: String(localized: "Conversation")
    case .listening: String(localized: "Listening")
    case .textOnly: String(localized: "Conversation")
    }
  }

  var systemImage: String {
    switch self {
    case .conversation: "bubble.left.and.bubble.right"
    case .listening: "ear"
    case .textOnly: "text.bubble"
    }
  }

  var startHint: String {
    self == .listening
      ? String(localized: "Translates the Japanese or English you hear.")
      : String(localized: "Speak Japanese or English. No need to pick a language first.")
  }
}

extension SpokenLanguage {
  var name: String {
    self == .japanese ? String(localized: "Japanese") : String(localized: "English")
  }

  var translationDirection: String {
    "\(name) → \(counterpart.name)"
  }
}

extension ConversationTiming {
  var silenceBeforePromptLength: String { Self.length(silenceBeforePrompt) }
  var silenceLength: String { Self.length(silenceBeforePrompt + promptCountdown) }

  private static func length(_ seconds: TimeInterval) -> String {
    Duration.seconds(seconds).formatted(.units(allowed: [.minutes, .seconds], width: .wide))
  }
}

struct FuriganaToggle: View {
  let readingAids: ReadingAidPreferences

  var body: some View {
    Toggle(isOn: showsFurigana) {
      Label("Furigana", systemImage: "textformat.size.smaller")
    }
  }

  private var showsFurigana: Binding<Bool> {
    Binding(get: { readingAids.showsFurigana }, set: { readingAids.showsFurigana = $0 })
  }
}

extension ConversationActivity {
  @MainActor func statusLine(in session: LiveConversation) -> String {
    switch self {
    case .listening: String(localized: "Listening")
    case .hearing: String(localized: "Hearing speech")
    case .waiting(let count): String(localized: "\(count) waiting for a pause")
    case .translating: String(localized: "Translating")
    case .speaking(let language): String(localized: "Speaking \(language.name)")
    case .paused(.silence): String(localized: "Paused after \(session.timing.silenceLength) of silence")
    case .paused(.background): String(localized: "Paused while you were away")
    case .paused: String(localized: "Paused")
    case .failed: String(localized: "Listening stopped")
    }
  }

  var isPaused: Bool {
    switch self {
    case .paused, .failed: true
    default: false
    }
  }

  var needsExplaining: Bool {
    switch self {
    case .paused(.silence), .paused(.background), .failed: true
    default: false
    }
  }
}

extension TranslatorFailure {
  var message: String {
    switch self {
    case .microphoneDenied:
      String(localized: "Translate needs the microphone to hear the conversation. Turn it on in \(ThisDevice.settingsApp).")
    case .speechRecognitionUnavailable:
      String(localized: "Speech recognition isn't available on this \(ThisDevice.name) right now. Try again in a moment.")
    case .translationUnavailable:
      String(localized: "On-device translation isn't ready. Download Japanese in \(ThisDevice.translationLanguagesSettings).")
    case .audioUnavailable:
      String(localized: "The microphone couldn't start. Close other apps that are recording and try again.")
    case .interrupted:
      String(localized: "Another app or a call used the microphone, so listening stopped.")
    }
  }
}

enum ConversationDateLabel {
  static func text(for date: Date, now: Date = .now, calendar: Calendar = .current) -> String {
    let time = date.formatted(date: .omitted, time: .shortened)
    if calendar.isDate(date, inSameDayAs: now) { return String(localized: "Today, \(time)") }
    if let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
      calendar.isDate(date, inSameDayAs: yesterday)
    {
      return String(localized: "Yesterday, \(time)")
    }
    let sameYear = calendar.isDate(date, equalTo: now, toGranularity: .year)
    let day =
      sameYear
      ? date.formatted(.dateTime.month(.abbreviated).day())
      : date.formatted(.dateTime.year().month(.abbreviated).day())
    return "\(day), \(time)"
  }
}

extension Conversation {
  var turnCountLabel: String {
    turns.count == 1 ? String(localized: "1 turn") : String(localized: "\(turns.count) turns")
  }

  var durationLabel: String {
    String(localized: "\(max(1, Int((duration / 60).rounded()))) min")
  }
}

struct TranslateWordLinks {
  let analysisClient: JapaneseTextAnalysisClient
  let open: (RecognizedWordSheetRequest) -> Void
}

struct TranslateLinkedText: View {
  let text: String
  let language: SpokenLanguage
  let identifier: String
  let words: TranslateWordLinks
  @Environment(ReadingAidPreferences.self) private var readingAids

  var body: some View {
    if language == .japanese {
      LinkedJapaneseText(
        text: text,
        highlightedQuery: SearchQuery(""),
        highlightedEntry: nil,
        japaneseTextAnalysisClient: words.analysisClient,
        identifierPrefix: identifier,
        presentation: readingAids.showsFurigana ? .standard : .compactLinks,
        openCandidates: { surface, candidates in
          words.open(
            RecognizedWordSheetRequest(
              id: "\(identifier).\(surface)", surface: surface, entry: nil,
              candidateEntries: candidates, encounterMedia: nil))
        },
        openWord: { entry in
          words.open(
            RecognizedWordSheetRequest(
              id: "\(identifier).\(entry.id.rawValue)", surface: entry.headword, entry: entry,
              candidateEntries: [], encounterMedia: nil))
        }
      )
    } else {
      Text(text)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityIdentifier(identifier)
    }
  }
}
