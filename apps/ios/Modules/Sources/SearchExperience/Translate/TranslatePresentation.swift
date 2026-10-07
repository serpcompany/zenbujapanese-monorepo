import SwiftUI
import TranslatorCore

extension TranslateMode {
  var title: String {
    switch self {
    case .conversation: String(localized: "Conversation")
    case .listening: String(localized: "Listening")
    case .textOnly: String(localized: "Text Only")
    }
  }

  var systemImage: String {
    switch self {
    case .conversation: "bubble.left.and.bubble.right"
    case .listening: "ear"
    case .textOnly: "text.bubble"
    }
  }

  var summary: String {
    switch self {
    case .conversation:
      String(localized: "Take turns speaking Japanese or English. Translations play out loud on your iPhone.")
    case .listening:
      String(localized: "Hear Japanese around you, like a TV, a guide, or announcements, in English. Best with earphones.")
    case .textOnly:
      String(localized: "Take turns speaking. Read the translations; nothing plays out loud.")
    }
  }

  var heroSymbol: String {
    switch self {
    case .conversation: "person.2.wave.2.fill"
    case .listening: "ear.badge.waveform"
    case .textOnly: "text.bubble.fill"
    }
  }

  var languagePair: String {
    self == .listening ? String(localized: "Japanese → English") : String(localized: "Japanese ⇄ English")
  }

  var startHint: String {
    self == .listening
      ? String(localized: "Translates Japanese you hear into English.")
      : String(localized: "Speak Japanese or English. No need to pick a language first.")
  }
}

extension SpokenLanguage {
  var name: String {
    self == .japanese ? String(localized: "Japanese") : String(localized: "English")
  }

  var shortLabel: String {
    self == .japanese ? "日本語" : "EN"
  }

  var directionLabel: String {
    "\(shortLabel) → \(counterpart.shortLabel)"
  }

  var translationDirection: String {
    "\(name) → \(counterpart.name)"
  }
}

extension ConversationActivity {
  func statusLine(listeningFor mode: TranslateMode) -> String {
    switch self {
    case .listening:
      mode == .listening
        ? String(localized: "Listening for Japanese") : String(localized: "Listening")
    case .hearing: String(localized: "Hearing speech")
    case .waiting(let count): String(localized: "\(count) waiting for a pause")
    case .translating: String(localized: "Translating")
    case .speaking(let language): String(localized: "Speaking \(language.name)")
    case .paused(.silence): String(localized: "Paused after 3 min of silence")
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

  var isSpeaking: Bool {
    if case .speaking = self { return true }
    return false
  }
}

extension TranslatorFailure {
  var message: String {
    switch self {
    case .microphoneDenied:
      String(localized: "Translate needs the microphone to hear the conversation. Turn it on in Settings.")
    case .speechRecognitionUnavailable:
      String(localized: "Speech recognition isn't available on this iPhone right now. Try again in a moment.")
    case .translationUnavailable:
      String(localized: "On-device translation isn't ready. Download Japanese in Settings › Apps › Translate.")
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

  var body: some View {
    if language == .japanese {
      LinkedJapaneseText(
        text: text,
        highlightedQuery: SearchQuery(""),
        highlightedEntry: nil,
        japaneseTextAnalysisClient: words.analysisClient,
        identifierPrefix: identifier,
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
