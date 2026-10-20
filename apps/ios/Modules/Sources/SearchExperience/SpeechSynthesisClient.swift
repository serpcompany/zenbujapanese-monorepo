import AVFoundation
import TranslatorCore

struct SpeechSynthesisClient: Sendable {
  var speak: @MainActor @Sendable (String, SpokenLanguage) -> Void

  @MainActor
  static let live = SpeechSynthesisClient { text, language in
    SpeechSynthesisAdapter.shared.speak(text, in: language)
  }
}

@MainActor
private final class SpeechSynthesisAdapter {
  static let shared = SpeechSynthesisAdapter()
  private let synthesizer = AVSpeechSynthesizer()

  private init() {}

  func speak(_ text: String, in language: SpokenLanguage) {
    if synthesizer.isSpeaking {
      synthesizer.stopSpeaking(at: .immediate)
    }
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = AVSpeechSynthesisVoice(language: language.localeIdentifier)
    utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.82
    synthesizer.speak(utterance)
  }
}
