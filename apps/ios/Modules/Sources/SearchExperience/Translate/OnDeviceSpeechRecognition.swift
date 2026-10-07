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

private struct LanguageAnalyzer {
  let language: SpokenLanguage
  let analyzer: SpeechAnalyzer
  let input: AsyncStream<AnalyzerInput>.Continuation
}

actor OnDeviceTranscriber {
  static let shared = OnDeviceTranscriber()
  static let stalledSentence: TimeInterval = 2
  static let pauseConfirmation: Duration = .milliseconds(300)
  static let finishedAtPauses: Set<SpokenLanguage> = [.japanese]

  private var engine = AVAudioEngine()
  private var generation = 0
  private let gate = MicrophoneGate()
  private var analyzers: [LanguageAnalyzer] = []
  private var unfinished: Set<SpokenLanguage> = []
  private var liveText: [SpokenLanguage: String] = [:]
  private var liveTextChangedAt: [SpokenLanguage: Date] = [:]
  private var analyzerFormat: AVAudioFormat?
  private var capture = CaptureProfile.nearbyVoices
  private var merger = BilingualTranscriptMerger(languages: [])
  private var heardContinuation: AsyncStream<HeardAudio>.Continuation?
  private var pauses = SpeechPauseDetector()
  private let output = EchoCancelledPlayback()
  private var eventContinuation: AsyncThrowingStream<TranscriptionEvent, any Error>.Continuation?
  private var resultTasks: [Task<Void, Never>] = []
  private var flushTask: Task<Void, Never>?
  private var pauseTask: Task<Void, Never>?
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
    let (events, eventContinuation) = AsyncThrowingStream.makeStream(
      of: TranscriptionEvent.self, throwing: (any Error).self)
    analyzerFormat = format
    capture = request.capture
    merger = BilingualTranscriptMerger(languages: request.languages)
    pauses = SpeechPauseDetector()
    #if DEBUG
      TranslateDiagnostics.shared.begin()
      TranslateDiagnostics.shared.note("start \(request.languages.map(\.rawValue)) \(format)")
    #endif
    let (heard, heardContinuation) = AsyncStream.makeStream(of: HeardAudio.self)
    self.heardContinuation = heardContinuation
    self.eventContinuation = eventContinuation
    gate.set(true)
    var started: [LanguageAnalyzer] = []
    do {
      for (language, transcriber) in transcribers {
        try ensureStillStarting(current)
        let analyzer = SpeechAnalyzer(
          modules: [transcriber],
          options: .init(priority: .userInitiated, modelRetention: .lingering))
        let (inputs, input) = AsyncStream.makeStream(of: AnalyzerInput.self)
        let entry = LanguageAnalyzer(language: language, analyzer: analyzer, input: input)
        started.append(entry)
        analyzers.append(entry)
        try await analyzer.prepareToAnalyze(in: format)
        try await analyzer.start(inputSequence: inputs)
      }
      try ensureStillStarting(current)
    } catch {
      guard current == generation else {
        await cancel(started)
        throw CancellationError()
      }
      await stop()
      throw TranslatorFailure.speechRecognitionUnavailable
    }
    resultTasks.append(
      Task {
        for await audio in heard { await hear(audio) }
      })
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
    let now = Date.now
    for analyzer in analyzers where unfinished.contains(analyzer.language) {
      let quiet = now.timeIntervalSince(liveTextChangedAt[analyzer.language] ?? .distantPast)
      guard quiet >= Self.stalledSentence else { continue }
      #if DEBUG
        TranslateDiagnostics.shared.note("finish stalled \(analyzer.language.rawValue)")
      #endif
      try? await analyzer.analyzer.finalize(through: nil)
    }
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
    heardContinuation?.finish()
    heardContinuation = nil
    let running = analyzers
    analyzers = []
    unfinished = []
    liveText = [:]
    liveTextChangedAt = [:]
    #if DEBUG
      TranslateDiagnostics.shared.end()
    #endif
    for analyzer in running {
      analyzer.input.finish()
      await analyzer.analyzer.cancelAndFinishNow()
    }
    for task in resultTasks { task.cancel() }
    resultTasks = []
    flushTask?.cancel()
    flushTask = nil
    pauseTask?.cancel()
    pauseTask = nil
    eventContinuation?.finish()
    eventContinuation = nil
    merger.reset()
    gate.set(true)
    AnalyzerAudioPipeline.releaseSession()
  }

  private func cancel(_ abandoned: [LanguageAnalyzer]) async {
    let ids = Set(abandoned.map { ObjectIdentifier($0.analyzer) })
    analyzers.removeAll { ids.contains(ObjectIdentifier($0.analyzer)) }
    for entry in abandoned {
      entry.input.finish()
      await entry.analyzer.cancelAndFinishNow()
    }
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
    guard let analyzerFormat, let heardContinuation, !analyzers.isEmpty else {
      throw TranslatorFailure.audioUnavailable
    }
    try AnalyzerAudioPipeline.configureSession(for: capture)
    let input = engine.inputNode
    try input.setVoiceProcessingEnabled(capture == .nearbyVoices)
    if capture == .nearbyVoices {
      input.voiceProcessingOtherAudioDuckingConfiguration = .init(
        enableAdvancedDucking: false, duckingLevel: .min)
      output.connect(to: engine)
    }
    let inputFormat = input.outputFormat(forBus: 0)
    guard let converter = AnalyzerBufferConverter(from: inputFormat, to: analyzerFormat) else {
      throw TranslatorFailure.audioUnavailable
    }
    input.installTap(
      onBus: 0, bufferSize: 4096, format: inputFormat,
      block: AnalyzerAudioPipeline.tap(
        converter: converter, gate: gate, inputs: analyzers.map(\.input),
        heard: heardContinuation))
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

  private func restartAudio() {
    guard !analyzers.isEmpty else { return }
    stopAudio()
    do {
      try startAudio()
    } catch {
      finish(throwing: .audioUnavailable)
    }
  }

  private func hear(_ audio: HeardAudio) async {
    guard let voiceEnd = pauses.hear(level: audio.level, duration: audio.duration) else { return }
    let detectedAt = Date.now
    pauseTask?.cancel()
    pauseTask = Task {
      try? await Task.sleep(for: Self.pauseConfirmation)
      guard !Task.isCancelled else { return }
      await finishPausedSentences(after: voiceEnd, detectedAt: detectedAt)
    }
  }

  private func finishPausedSentences(after voiceEnd: TimeInterval, detectedAt: Date) async {
    #if DEBUG
      TranslateDiagnostics.shared.note(String(format: "pause after voice at %.2f", voiceEnd))
    #endif
    for analyzer in analyzers
    where Self.finishedAtPauses.contains(analyzer.language) && unfinished.contains(analyzer.language) {
      guard (liveTextChangedAt[analyzer.language] ?? .distantPast) <= detectedAt else {
        #if DEBUG
          TranslateDiagnostics.shared.note("pause not confirmed by \(analyzer.language.rawValue)")
        #endif
        continue
      }
      #if DEBUG
        TranslateDiagnostics.shared.note("finalize \(analyzer.language.rawValue)")
      #endif
      try? await analyzer.analyzer.finalize(through: nil)
    }
  }

  private func receive(_ result: SpeechTranscriber.Result, from language: SpokenLanguage) {
    let text = String(result.text.characters)
    if result.isFinal || text.isEmpty {
      unfinished.remove(language)
      liveText[language] = nil
    } else {
      unfinished.insert(language)
      if liveText[language] != text {
        liveText[language] = text
        liveTextChangedAt[language] = .now
      }
    }
    #if DEBUG
      TranslateDiagnostics.shared.note(
        String(
          format: "%@ %@ %.2f-%.2f c=%.2f %@", language.rawValue, result.isFinal ? "F" : "v",
          result.range.start.seconds, result.range.end.seconds,
          Self.confidence(of: result.text) ?? -1, text))
    #endif
    let events = merger.receive(
      TranscriberResult(
        language: language,
        text: text,
        confidence: Self.confidence(of: result.text),
        isFinal: result.isFinal,
        start: result.range.start.seconds,
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
