import AVFoundation

struct SpeechSynthesisClient: Sendable {
  var speak: @MainActor @Sendable (String) -> Void

  @MainActor
  static let live = SpeechSynthesisClient { text in
    JapaneseSpeechSynthesisAdapter.shared.speak(text)
  }
}

@MainActor
private final class JapaneseSpeechSynthesisAdapter {
  static let shared = JapaneseSpeechSynthesisAdapter()
  private let synthesizer = AVSpeechSynthesizer()

  private init() {}

  func speak(_ text: String) {
    if synthesizer.isSpeaking {
      synthesizer.stopSpeaking(at: .immediate)
    }
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = AVSpeechSynthesisVoice(language: "ja-JP")
    utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.82
    synthesizer.speak(utterance)
  }
}
