import AVFoundation
import Speech
import TranslatorCore

enum OnDeviceSpeechAssets {
  static func transcriber(for language: SpokenLanguage) async throws -> SpeechTranscriber {
    guard SpeechTranscriber.isAvailable,
      let locale = await SpeechTranscriber.supportedLocale(
        equivalentTo: Locale(identifier: language.localeIdentifier))
    else { throw TranslatorFailure.speechRecognitionUnavailable }
    return SpeechTranscriber(
      locale: locale,
      transcriptionOptions: [],
      reportingOptions: [.volatileResults, .fastResults],
      attributeOptions: [.transcriptionConfidence]
    )
  }

  static func needsDownload(_ languages: [SpokenLanguage]) async throws -> Bool {
    var modules: [any SpeechModule] = []
    for language in languages { modules.append(try await transcriber(for: language)) }
    return await AssetInventory.status(forModules: modules) != .installed
  }

  static func install(
    _ languages: [SpokenLanguage], progress: @escaping @Sendable (Double) -> Void
  ) async throws {
    var modules: [any SpeechModule] = []
    for language in languages {
      let transcriber = try await transcriber(for: language)
      for locale in transcriber.selectedLocales { _ = try? await AssetInventory.reserve(locale: locale) }
      modules.append(transcriber)
    }
    guard let request = try await AssetInventory.assetInstallationRequest(supporting: modules)
    else { return }
    let observation = request.progress.observe(\.fractionCompleted) { progressReport, _ in
      progress(progressReport.fractionCompleted)
    }
    defer { observation.invalidate() }
    do {
      try await request.downloadAndInstall()
    } catch {
      throw TranslatorFailure.speechRecognitionUnavailable
    }
  }
}

actor OnDeviceTranscriber {
  static let shared = OnDeviceTranscriber()

  private var engine = AVAudioEngine()
  private var generation = 0
  private let gate = MicrophoneGate()
  private var analyzer: SpeechAnalyzer?
  private var analyzerFormat: AVAudioFormat?
  private var capture = CaptureProfile.nearbyVoices
  private var merger = BilingualTranscriptMerger(languages: [])
  private var inputContinuation: AsyncStream<AnalyzerInput>.Continuation?
  private var eventContinuation: AsyncThrowingStream<TranscriptionEvent, any Error>.Continuation?
  private var resultTasks: [Task<Void, Never>] = []
  private var flushTask: Task<Void, Never>?
  private var observers: [any NSObjectProtocol] = []
  private var tapInstalled = false

  func start(_ request: TranscriptionRequest) async throws -> AsyncThrowingStream<
    TranscriptionEvent, any Error
  > {
    await stop()
    let current = generation
    var transcribers: [(SpokenLanguage, SpeechTranscriber)] = []
    for language in request.languages {
      transcribers.append((language, try await OnDeviceSpeechAssets.transcriber(for: language)))
    }
    let modules = transcribers.map(\.1)
    guard await AssetInventory.status(forModules: modules) == .installed,
      let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: modules)
    else { throw TranslatorFailure.speechRecognitionUnavailable }
    try ensureStillStarting(current)
    let analyzer = SpeechAnalyzer(
      modules: modules, options: .init(priority: .userInitiated, modelRetention: .lingering))
    let (inputs, inputContinuation) = AsyncStream.makeStream(of: AnalyzerInput.self)
    let (events, eventContinuation) = AsyncThrowingStream.makeStream(
      of: TranscriptionEvent.self, throwing: (any Error).self)
    self.analyzer = analyzer
    analyzerFormat = format
    capture = request.capture
    merger = BilingualTranscriptMerger(languages: request.languages)
    self.inputContinuation = inputContinuation
    self.eventContinuation = eventContinuation
    gate.set(true)
    do {
      try await analyzer.prepareToAnalyze(in: format)
      try await analyzer.start(inputSequence: inputs)
    } catch {
      if current == generation { await stop() }
      throw TranslatorFailure.speechRecognitionUnavailable
    }
    try ensureStillStarting(current)
    for (language, transcriber) in transcribers {
      resultTasks.append(
        Task {
          do {
            for try await result in transcriber.results { receive(result, from: language) }
          } catch {
            finish(throwing: .speechRecognitionUnavailable)
          }
        })
    }
    do {
      try startAudio()
    } catch {
      await stop()
      throw TranslatorFailure.audioUnavailable
    }
    observers = AnalyzerAudioPipeline.observeInterruptions(
      interrupted: { [weak self] in Task { await self?.finish(throwing: .interrupted) } },
      mediaServicesReset: { [weak self] in Task { await self?.replaceEngine() } }
    )
    observers.append(
      AnalyzerAudioPipeline.observeConfigurationChanges(of: engine) { [weak self] in
        Task { await self?.restartAudio() }
      })
    return events
  }

  func finishUtterance() async {
    try? await analyzer?.finalize(through: nil)
  }

  func setHearing(_ isHearing: Bool) async {
    gate.set(isHearing)
    if !isHearing { await finishUtterance() }
  }

  func stop() async {
    generation += 1
    for observer in observers { NotificationCenter.default.removeObserver(observer) }
    observers = []
    stopAudio()
    inputContinuation?.finish()
    inputContinuation = nil
    if let analyzer { await analyzer.cancelAndFinishNow() }
    analyzer = nil
    for task in resultTasks { task.cancel() }
    resultTasks = []
    flushTask?.cancel()
    flushTask = nil
    eventContinuation?.finish()
    eventContinuation = nil
    merger.reset()
    gate.set(true)
    AnalyzerAudioPipeline.releaseSession()
  }

  private func ensureStillStarting(_ startGeneration: Int) throws {
    guard startGeneration == generation else { throw CancellationError() }
  }

  private func replaceEngine() {
    tapInstalled = false
    engine = AVAudioEngine()
    finish(throwing: .interrupted)
  }

  private func startAudio() throws {
    guard let analyzerFormat, let inputContinuation else {
      throw TranslatorFailure.audioUnavailable
    }
    try AnalyzerAudioPipeline.configureSession(for: capture)
    let input = engine.inputNode
    try input.setVoiceProcessingEnabled(capture == .nearbyVoices)
    if capture == .nearbyVoices {
      input.voiceProcessingOtherAudioDuckingConfiguration = .init(
        enableAdvancedDucking: false, duckingLevel: .min)
    }
    let inputFormat = input.outputFormat(forBus: 0)
    guard let converter = AnalyzerBufferConverter(from: inputFormat, to: analyzerFormat) else {
      throw TranslatorFailure.audioUnavailable
    }
    input.installTap(
      onBus: 0, bufferSize: 4096, format: inputFormat,
      block: AnalyzerAudioPipeline.tap(
        converter: converter, gate: gate, continuation: inputContinuation))
    tapInstalled = true
    engine.prepare()
    try engine.start()
  }

  private func stopAudio() {
    if engine.isRunning { engine.stop() }
    if tapInstalled {
      engine.inputNode.removeTap(onBus: 0)
      tapInstalled = false
    }
  }

  private func restartAudio() {
    guard analyzer != nil else { return }
    stopAudio()
    do {
      try startAudio()
    } catch {
      finish(throwing: .audioUnavailable)
    }
  }

  private func receive(_ result: SpeechTranscriber.Result, from language: SpokenLanguage) {
    let events = merger.receive(
      TranscriberResult(
        language: language,
        text: String(result.text.characters),
        confidence: Self.confidence(of: result.text),
        isFinal: result.isFinal,
        end: result.range.end.seconds
      ),
      at: .now
    )
    for event in events { eventContinuation?.yield(event) }
    scheduleFlush()
  }

  private func scheduleFlush() {
    guard merger.isWaitingForCounterpart, flushTask == nil else { return }
    flushTask = Task {
      try? await Task.sleep(for: .seconds(BilingualTranscriptMerger.pairingWindow))
      guard !Task.isCancelled else { return }
      flushTask = nil
      for event in merger.flush(at: .now) { eventContinuation?.yield(event) }
      scheduleFlush()
    }
  }

  private func finish(throwing failure: TranslatorFailure) {
    eventContinuation?.finish(throwing: failure)
    eventContinuation = nil
  }

  private static func confidence(of text: AttributedString) -> Double? {
    var total = 0.0
    var weight = 0.0
    for run in text.runs {
      guard let confidence = run.transcriptionConfidence else { continue }
      let length = Double(text[run.range].characters.count)
      total += confidence * length
      weight += length
    }
    return weight > 0 ? total / weight : nil
  }
}
