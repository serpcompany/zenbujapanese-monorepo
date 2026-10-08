import AVFoundation
import Speech
import TranslatorCore

private struct LanguageAnalyzer {
  let language: SpokenLanguage
  let analyzer: SpeechAnalyzer
  let input: AsyncStream<AnalyzerInput>.Continuation
}

public actor BilingualRecognizer {
  static let pauseConfirmation: Duration = .milliseconds(300)
  static let pauseChecks = 5
  static let pauseMargin: TimeInterval = 0.3
  static let finishedAtPauses: Set<SpokenLanguage> = [.japanese]

  private var generation = 0
  private var analyzers: [LanguageAnalyzer] = []
  private var unfinished: Set<SpokenLanguage> = []
  private var liveText: [SpokenLanguage: String] = [:]
  private var liveTextChangedAt: [SpokenLanguage: Date] = [:]
  private var merger = BilingualTranscriptMerger(languages: [])
  private var pauses = SpeechPauseDetector()
  #if DEBUG
    private var hasHeardAudio = false
  #endif
  private var heardContinuation: AsyncStream<HeardAudio>.Continuation?
  private var eventContinuation: AsyncThrowingStream<TranscriptionEvent, any Error>.Continuation?
  private var resultTasks: [Task<Void, Never>] = []
  private var flushTask: Task<Void, Never>?
  private var pauseTask: Task<Void, Never>?

  public init() {}

  public func start(_ languages: [SpokenLanguage]) async throws -> RecognizerSession {
    await stop()
    let current = generation
    var transcribers: [(SpokenLanguage, SpeechTranscriber)] = []
    for language in languages {
      transcribers.append((language, try await OnDeviceSpeechAssets.transcriber(for: language)))
    }
    let modules = transcribers.map(\.1)
    guard await AssetInventory.status(forModules: modules) == .installed,
      let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: modules)
    else { throw TranslatorFailure.speechRecognitionUnavailable }
    try ensureStillStarting(current)
    let (events, eventContinuation) = AsyncThrowingStream.makeStream(
      of: TranscriptionEvent.self, throwing: (any Error).self)
    merger = BilingualTranscriptMerger(languages: languages)
    pauses = SpeechPauseDetector()
    #if DEBUG
      hasHeardAudio = false
      TranslateDiagnostics.shared.begin()
      TranslateDiagnostics.shared.note("start \(languages.map(\.rawValue)) \(format)")
    #endif
    let (heard, heardContinuation) = AsyncStream.makeStream(of: HeardAudio.self)
    self.heardContinuation = heardContinuation
    self.eventContinuation = eventContinuation
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
            for try await result in transcriber.results {
              receive(result, from: language, startedAs: current)
            }
          } catch {
            if current == generation { fail(.speechRecognitionUnavailable) }
          }
        })
    }
    return RecognizerSession(
      events: events,
      feed: RecognizerFeed(
        format: format, inputs: analyzers.map(\.input), heard: heardContinuation))
  }

  public func finishUtterance() async {
    let now = Date.now
    for analyzer in analyzers where unfinished.contains(analyzer.language) {
      let unchanged = now.timeIntervalSince(liveTextChangedAt[analyzer.language] ?? .distantPast)
      guard pauses.finishesStalledSentence(unchangedFor: unchanged) else { continue }
      #if DEBUG
        TranslateDiagnostics.shared.note("finish stalled \(analyzer.language.rawValue)")
      #endif
      try? await analyzer.analyzer.finalize(through: nil)
    }
  }

  public func stop() async {
    generation += 1
    heardContinuation?.finish()
    heardContinuation = nil
    let running = analyzers
    analyzers = []
    unfinished = []
    liveText = [:]
    liveTextChangedAt = [:]
    for task in resultTasks { task.cancel() }
    resultTasks = []
    flushTask?.cancel()
    flushTask = nil
    pauseTask?.cancel()
    pauseTask = nil
    eventContinuation?.finish()
    eventContinuation = nil
    #if DEBUG
      TranslateDiagnostics.shared.end()
    #endif
    for analyzer in running {
      analyzer.input.finish()
      await analyzer.analyzer.cancelAndFinishNow()
    }
  }

  public func fail(_ failure: TranslatorFailure) {
    eventContinuation?.finish(throwing: failure)
    eventContinuation = nil
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

  private func hear(_ audio: HeardAudio) async {
    #if DEBUG
      if !hasHeardAudio { TranslateDiagnostics.shared.note("audio starts") }
      hasHeardAudio = true
    #endif
    guard let voiceEnd = pauses.hear(level: audio.level, duration: audio.duration) else { return }
    pauseTask?.cancel()
    pauseTask = Task { await finishPausedSentences(after: voiceEnd) }
  }

  private func finishPausedSentences(after voiceEnd: TimeInterval) async {
    var since = Date.now
    try? await Task.sleep(for: Self.pauseConfirmation)
    guard !Task.isCancelled else { return }
    #if DEBUG
      TranslateDiagnostics.shared.note(String(format: "pause after voice at %.2f", voiceEnd))
    #endif
    var pending = Self.finishedAtPauses
    for _ in 0..<Self.pauseChecks where !pending.isEmpty {
      for analyzer in analyzers where pending.contains(analyzer.language) {
        guard (liveTextChangedAt[analyzer.language] ?? .distantPast) <= since else {
          #if DEBUG
            TranslateDiagnostics.shared.note("pause not confirmed by \(analyzer.language.rawValue)")
          #endif
          continue
        }
        pending.remove(analyzer.language)
        #if DEBUG
          TranslateDiagnostics.shared.note("finalize \(analyzer.language.rawValue)")
        #endif
        try? await analyzer.analyzer.finalize(
          through: CMTime(seconds: voiceEnd + Self.pauseMargin, preferredTimescale: 1000))
      }
      since = Date.now
      try? await Task.sleep(for: Self.pauseConfirmation)
      guard !Task.isCancelled, pauses.quietFor >= SpeechPauseDetector.minimumPause else { return }
    }
  }

  private func receive(
    _ result: SpeechTranscriber.Result, from language: SpokenLanguage, startedAs session: Int
  ) {
    guard session == generation else { return }
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
