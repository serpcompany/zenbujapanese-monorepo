import AVFoundation

struct SpeechSynthesisClient: Sendable {
  var speak: @MainActor @Sendable (String) -> Void

  @MainActor
  static let live = SpeechSynthesisClient { text in
    JapaneseSpeechSynthesisAdapter.shared.speak(text)
  }

  #if DEBUG
  static func clientFromProcessArguments() -> SpeechSynthesisClient? {
    guard ProcessInfo.processInfo.arguments.contains("-RecordSpeechRequests") else { return nil }
    return SpeechSynthesisClient { text in
      NotificationCenter.default.post(name: .speechSynthesisRequested, object: text)
    }
  }
  #endif
}

extension Notification.Name {
  static let speechSynthesisRequested = Notification.Name("SpeechSynthesisRequested")
}

#if DEBUG
struct SpeechPlaybackVerificationEvent: Sendable {
  enum Phase: Equatable, Sendable {
    case started
    case finished
  }

  let invocationID: UUID
  let phase: Phase
  let text: String
  let voiceLanguage: String?
}

enum SpeechPlaybackVerification {
  static let processArgument = "-ObserveSpeechPlayback"
  static let notification = Notification.Name("SpeechPlaybackVerificationEvent")

  static var isEnabled: Bool {
    ProcessInfo.processInfo.arguments.contains(processArgument)
  }
}
#endif

@MainActor
private final class JapaneseSpeechSynthesisAdapter: NSObject, AVSpeechSynthesizerDelegate {
  static let shared = JapaneseSpeechSynthesisAdapter()
  private let synthesizer = AVSpeechSynthesizer()
  #if DEBUG
  private var verificationInvocationIDs: [ObjectIdentifier: UUID] = [:]
  #endif

  private override init() {
    super.init()
    synthesizer.delegate = self
  }

  func speak(_ text: String) {
    if synthesizer.isSpeaking {
      synthesizer.stopSpeaking(at: .immediate)
    }
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = AVSpeechSynthesisVoice(language: "ja-JP")
    utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.82
    #if DEBUG
    if SpeechPlaybackVerification.isEnabled {
      verificationInvocationIDs[ObjectIdentifier(utterance)] = UUID()
    }
    #endif
    synthesizer.speak(utterance)
  }

  nonisolated func speechSynthesizer(
    _ synthesizer: AVSpeechSynthesizer,
    didStart utterance: AVSpeechUtterance
  ) {
    #if DEBUG
    postVerificationEvent(.started, utterance: utterance)
    #endif
  }

  nonisolated func speechSynthesizer(
    _ synthesizer: AVSpeechSynthesizer,
    didFinish utterance: AVSpeechUtterance
  ) {
    #if DEBUG
    postVerificationEvent(.finished, utterance: utterance)
    #endif
  }

  nonisolated func speechSynthesizer(
    _ synthesizer: AVSpeechSynthesizer,
    didCancel utterance: AVSpeechUtterance
  ) {
    #if DEBUG
    let utteranceID = ObjectIdentifier(utterance)
    Task { @MainActor [weak self] in
      self?.verificationInvocationIDs.removeValue(forKey: utteranceID)
    }
    #endif
  }

  #if DEBUG
  nonisolated private func postVerificationEvent(
    _ phase: SpeechPlaybackVerificationEvent.Phase,
    utterance: AVSpeechUtterance
  ) {
    let utteranceID = ObjectIdentifier(utterance)
    let text = utterance.speechString
    let voiceLanguage = utterance.voice?.language
    Task { @MainActor [weak self] in
      guard
        let self,
        let invocationID = verificationInvocationIDs[utteranceID]
      else { return }
      let event = SpeechPlaybackVerificationEvent(
        invocationID: invocationID,
        phase: phase,
        text: text,
        voiceLanguage: voiceLanguage
      )
      NotificationCenter.default.post(name: SpeechPlaybackVerification.notification, object: event)
      if phase == .finished {
        verificationInvocationIDs.removeValue(forKey: utteranceID)
      }
    }
  }
  #endif
}
