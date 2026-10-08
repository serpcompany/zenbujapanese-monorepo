import AVFoundation
import TranslatorCore
import TranslatorOnDevice

actor OnDeviceTranscriber {
  static let shared = OnDeviceTranscriber()

  private var engine = AVAudioEngine()
  private var generation = 0
  private let gate = MicrophoneGate()
  private let recognizer = BilingualRecognizer()
  private var feed: RecognizerFeed?
  private var capture = CaptureProfile.nearbyVoices
  private let output = EchoCancelledPlayback()
  private var observers: [any NSObjectProtocol] = []
  private var tapInstalled = false

  func start(_ request: TranscriptionRequest) async throws -> AsyncThrowingStream<
    TranscriptionEvent, any Error
  > {
    await stop()
    let current = generation
    capture = request.capture
    gate.set(true)
    let session = try await recognizer.start(request.languages)
    guard current == generation else {
      await recognizer.stop()
      throw CancellationError()
    }
    feed = session.feed
    do {
      try startAudio()
    } catch {
      await stop()
      throw TranslatorFailure.audioUnavailable
    }
    observers = AnalyzerAudioPipeline.observeInterruptions(
      interrupted: { [weak self] in Task { await self?.fail(.interrupted) } },
      mediaServicesReset: { [weak self] in Task { await self?.replaceEngine() } }
    )
    observers.append(
      AnalyzerAudioPipeline.observeConfigurationChanges(of: engine) { [weak self] in
        Task { await self?.restartAudio() }
      })
    return session.events
  }

  func finishUtterance() async {
    await recognizer.finishUtterance()
  }

  func echoCancelledOutput() -> EchoCancelledPlayback? {
    guard tapInstalled, engine.isRunning, capture == .nearbyVoices else { return nil }
    return output
  }

  func setHearing(_ isHearing: Bool) async {
    gate.set(isHearing)
    #if DEBUG
      TranslateDiagnostics.shared.note("hearing \(isHearing)")
    #endif
  }

  func stop() async {
    generation += 1
    for observer in observers { NotificationCenter.default.removeObserver(observer) }
    observers = []
    stopAudio()
    feed = nil
    await recognizer.stop()
    gate.set(true)
    AnalyzerAudioPipeline.releaseSession()
  }

  private func fail(_ failure: TranslatorFailure) async {
    await recognizer.fail(failure)
  }

  private func replaceEngine() async {
    tapInstalled = false
    engine = AVAudioEngine()
    await fail(.interrupted)
  }

  private func startAudio() throws {
    guard let feed else { throw TranslatorFailure.audioUnavailable }
    try AnalyzerAudioPipeline.configureSession(for: capture)
    let input = engine.inputNode
    try input.setVoiceProcessingEnabled(capture == .nearbyVoices)
    if capture == .nearbyVoices {
      input.voiceProcessingOtherAudioDuckingConfiguration = .init(
        enableAdvancedDucking: false, duckingLevel: .min)
      output.connect(to: engine)
    }
    let inputFormat = input.outputFormat(forBus: 0)
    guard let converter = AnalyzerBufferConverter(from: inputFormat, to: feed.format) else {
      throw TranslatorFailure.audioUnavailable
    }
    input.installTap(
      onBus: 0, bufferSize: 4096, format: inputFormat,
      block: AnalyzerAudioPipeline.tap(converter: converter, gate: gate, feed: feed))
    tapInstalled = true
    engine.prepare()
    try engine.start()
  }

  private func stopAudio() {
    output.stop()
    if engine.isRunning { engine.stop() }
    if tapInstalled {
      engine.inputNode.removeTap(onBus: 0)
      tapInstalled = false
    }
  }

  private func restartAudio() async {
    guard feed != nil else { return }
    stopAudio()
    do {
      try startAudio()
    } catch {
      await fail(.audioUnavailable)
    }
  }
}
