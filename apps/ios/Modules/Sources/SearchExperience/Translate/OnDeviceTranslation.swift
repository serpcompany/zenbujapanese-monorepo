import AVFoundation
import Translation
import TranslatorCore
import TranslatorOnDevice

enum OnDeviceTranslation {
  static var downloadConfiguration: TranslationSession.Configuration {
    TranslationSession.Configuration(
      source: SpokenLanguage.japanese.translationLanguage,
      target: SpokenLanguage.english.translationLanguage)
  }

  static func availability() async -> NaturalTranslationAvailability {
    let availability = LanguageAvailability()
    var statuses: [LanguageAvailability.Status] = []
    for language in SpokenLanguage.allCases {
      statuses.append(
        await availability.status(
          from: language.translationLanguage, to: language.counterpart.translationLanguage))
    }
    if statuses.contains(.unsupported) { return .unsupported }
    return statuses.allSatisfy { $0 == .installed } ? .installed : .downloadable
  }
}

@MainActor
final class SystemSpeechPlayer: NSObject, AVSpeechSynthesizerDelegate {
  static let shared = SystemSpeechPlayer()

  nonisolated static let client = SpeechPlaybackClient(
    speak: { text, language in
      if let output = await OnDeviceTranscriber.shared.echoCancelledOutput() {
        await SystemSpeechPlayer.shared.speak(text, in: language, through: output)
      } else {
        await SystemSpeechPlayer.shared.speak(text, in: language)
      }
    },
    stop: { await SystemSpeechPlayer.shared.stop() },
    reachesMicrophone: {
      await OnDeviceTranscriber.shared.echoCancelledOutput() == nil
        && ConversationAudioSession.outputReachesMicrophone()
    }
  )

  private var synthesizer = AVSpeechSynthesizer()
  private var waiting: (utterance: ObjectIdentifier, continuation: CheckedContinuation<Void, Never>)?
  private var engineOutput: EchoCancelledPlayback?
  var speed = 1.0
  private var resetObserver: (any NSObjectProtocol)?

  override private init() {
    super.init()
    synthesizer.delegate = self
    resetObserver = Self.observeMediaServicesReset()
  }

  nonisolated private static func observeMediaServicesReset() -> (any NSObjectProtocol)? {
    ConversationAudioSession.observeMediaServicesReset {
      Task { @MainActor in SystemSpeechPlayer.shared.replaceSynthesizer() }
    }
  }

  private func replaceSynthesizer() {
    stop()
    synthesizer = AVSpeechSynthesizer()
    synthesizer.delegate = self
  }

  private func utterance(_ text: String, in language: SpokenLanguage) -> AVSpeechUtterance {
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = AVSpeechSynthesisVoice(language: language.localeIdentifier)
    let rate = Float(language == .japanese ? 0.46 : 0.49) * Float(speed)
    utterance.rate = min(max(rate, AVSpeechUtteranceMinimumSpeechRate), AVSpeechUtteranceMaximumSpeechRate)
    return utterance
  }

  func speak(
    _ text: String, in language: SpokenLanguage, through output: EchoCancelledPlayback
  ) async {
    stop()
    engineOutput = output
    #if DEBUG
      TranslateDiagnostics.shared.note("speak \(language.rawValue) \(text)")
    #endif
    let spoken = utterance(text, in: language)
    let limit = Self.speakingLimit(for: text, speed: speed)
    let watchdog = Task {
      try? await Task.sleep(for: limit)
      if !Task.isCancelled { output.stop() }
    }
    await withCheckedContinuation { continuation in
      let generation = output.begin(continuation)
      synthesizer.write(
        spoken,
        toBufferCallback: EchoCancelledPlayback.receiver(for: output, generation: generation))
    }
    watchdog.cancel()
  }

  static func speakingLimit(for text: String, speed: Double) -> Duration {
    .seconds(5 + Double(text.count) * 0.3 / max(speed, 0.5))
  }

  func speak(_ text: String, in language: SpokenLanguage) async {
    stop()
    let spoken = utterance(text, in: language)
    await withCheckedContinuation { continuation in
      waiting = (ObjectIdentifier(spoken), continuation)
      synthesizer.speak(spoken)
    }
  }

  func stop() {
    synthesizer.stopSpeaking(at: .immediate)
    engineOutput?.stop()
    engineOutput = nil
    waiting?.continuation.resume()
    waiting = nil
  }

  private func finished(_ utterance: ObjectIdentifier) {
    guard waiting?.utterance == utterance else { return }
    waiting?.continuation.resume()
    waiting = nil
  }

  nonisolated func speechSynthesizer(
    _ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance
  ) {
    let id = ObjectIdentifier(utterance)
    Task { @MainActor in finished(id) }
  }

  nonisolated func speechSynthesizer(
    _ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance
  ) {
    let id = ObjectIdentifier(utterance)
    Task { @MainActor in finished(id) }
  }
}

struct TranslateServices: Sendable {
  var clients: TranslatorClients
  var requestMicrophone: @Sendable () async -> Bool
  var translationAvailability: @Sendable () async -> NaturalTranslationAvailability
  var speechNeedsDownload: @Sendable ([SpokenLanguage]) async throws -> Bool
  var installSpeech: @Sendable ([SpokenLanguage], @escaping @Sendable (Double) -> Void) async throws -> Void
  var timing = ConversationTiming.standard
  var setSpeechSpeed: @MainActor (Double) -> Void = { _ in }

  static let onDevice = TranslateServices(
    clients: TranslatorClients(
      transcription: TranscriptionClient(
        start: { try await OnDeviceTranscriber.shared.start($0) },
        finishUtterance: { await OnDeviceTranscriber.shared.finishUtterance() },
        setHearing: { await OnDeviceTranscriber.shared.setHearing($0) },
        stop: { await OnDeviceTranscriber.shared.stop() }
      ),
      translation: .onDevice,
      playback: SystemSpeechPlayer.client
    ),
    requestMicrophone: { await AVAudioApplication.requestRecordPermission() },
    translationAvailability: { await OnDeviceTranslation.availability() },
    speechNeedsDownload: { try await OnDeviceSpeechAssets.needsDownload($0) },
    installSpeech: { try await OnDeviceSpeechAssets.install($0, progress: $1) },
    setSpeechSpeed: { SystemSpeechPlayer.shared.speed = $0 }
  )
}
