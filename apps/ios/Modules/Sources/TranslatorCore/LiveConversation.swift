import Foundation
import Observation

@MainActor
public protocol ConversationArchiving: AnyObject {
  func save(_ conversation: Conversation)
  func delete(_ id: UUID)
}

public struct LiveSentence: Sendable, Equatable {
  public var language: SpokenLanguage
  public var text: String
  public var provisionalTranslation: String?
}

public enum PauseReason: Sendable, Equatable {
  case byUser
  case silence
  case background
  case leaving
}

public enum ConversationStatus: Sendable, Equatable {
  case ready
  case live
  case paused(PauseReason)
  case failed(TranslatorFailure)
}

public enum ConversationActivity: Sendable, Equatable {
  case listening
  case hearing
  case waiting(Int)
  case translating
  case speaking(SpokenLanguage)
  case paused(PauseReason)
  case failed(TranslatorFailure)
}

@MainActor
@Observable
public final class LiveConversation {
  public internal(set) var conversation: Conversation
  public internal(set) var status = ConversationStatus.ready
  public internal(set) var mode: TranslateMode
  public internal(set) var liveSentence: LiveSentence?
  public internal(set) var openTurnID: UUID?
  public internal(set) var speakingSentenceID: UUID?
  public internal(set) var speakingLanguage: SpokenLanguage?
  public internal(set) var silencePromptDeadline: Date?
  public internal(set) var translatingSentenceIDs: Set<UUID> = []
  public internal(set) var untranslatedSentenceIDs: Set<UUID> = []

  var openTurnStartedAt: Date?
  var lastSpeechAt: Date
  var lastVolatileChangeAt: Date
  var liveSince: Date?
  var accumulatedLiveTime: TimeInterval = 0
  var playbackQueue: [UUID] = []
  var isDiscarded = false
  var hasLeft = false

  @ObservationIgnored var finishUtteranceRequested = false
  @ObservationIgnored var provisionalInFlight = false
  @ObservationIgnored var micClosedForPlayback = false
  @ObservationIgnored var echoGuard = EchoGuard()
  @ObservationIgnored var listenTask: Task<Void, Never>?
  @ObservationIgnored var tickTask: Task<Void, Never>?
  @ObservationIgnored var provisionalTask: Task<Void, Never>?
  @ObservationIgnored var playbackTask: Task<Void, Never>?
  @ObservationIgnored var teardownTask: Task<Void, Never>?
  @ObservationIgnored var translationTasks: [UUID: Task<Void, Never>] = [:]

  let clients: TranslatorClients
  let timing: ConversationTiming
  let ticker: ConversationTicker
  let archive: (any ConversationArchiving)?
  let now: () -> Date

  public init(
    mode: TranslateMode,
    clients: TranslatorClients,
    archive: (any ConversationArchiving)?,
    timing: ConversationTiming = .standard,
    ticker: ConversationTicker = .continuous,
    now: @escaping () -> Date = Date.init
  ) {
    let startedAt = now()
    conversation = Conversation(startedAt: startedAt, mode: mode)
    self.mode = mode
    self.clients = clients
    self.archive = archive
    self.timing = timing
    self.ticker = ticker
    self.now = now
    lastSpeechAt = startedAt
    lastVolatileChangeAt = startedAt
  }

  public var hasSentences: Bool {
    conversation.turns.contains { !$0.sentences.isEmpty }
  }

  public var isLive: Bool { status == .live }

  public var openTurn: ConversationTurn? {
    guard let openTurnID else { return nil }
    return conversation.turns.last { $0.id == openTurnID }
  }

  public var heldSentenceCount: Int {
    guard mode.playback == .afterEachTurn else { return 0 }
    return openTurn?.sentences.count ?? 0
  }

  public var activity: ConversationActivity {
    switch status {
    case .ready: return .listening
    case .paused(let reason): return .paused(reason)
    case .failed(let failure): return .failed(failure)
    case .live:
      if let speakingLanguage { return .speaking(speakingLanguage) }
      if liveSentence != nil {
        let held = heldSentenceCount
        return held > 0 ? .waiting(held) : .hearing
      }
      return translatingSentenceIDs.isEmpty ? .listening : .translating
    }
  }

  public func elapsed(at date: Date) -> TimeInterval {
    accumulatedLiveTime + (liveSince.map { max(0, date.timeIntervalSince($0)) } ?? 0)
  }

  public func start() {
    guard status != .live, !hasLeft else { return }
    let now = now()
    status = .live
    liveSince = now
    lastSpeechAt = now
    lastVolatileChangeAt = now
    silencePromptDeadline = nil
    startListening()
  }

  public func pause(_ reason: PauseReason = .byUser) {
    guard status == .live else { return }
    stopListening(then: .paused(reason))
  }

  public func appMovedToBackground() {
    pause(.background)
  }

  public func keepListening() {
    guard silencePromptDeadline != nil else { return }
    silencePromptDeadline = nil
    lastSpeechAt = now()
  }

  public func switchMode(to newMode: TranslateMode) {
    guard newMode != mode, mode.canSwitchWithinSession(to: newMode) else { return }
    mode = newMode
    conversation.mode = newMode
    guard newMode.playback == .never else { return }
    playbackQueue.removeAll()
    if speakingSentenceID != nil {
      Task { [clients] in await clients.playback.stop() }
    }
  }

  public func leave(saving: Bool) async {
    hasLeft = true
    if status == .live { stopListening(then: .paused(.leaving)) }
    if saving {
      for task in translationTasks.values { await task.value }
      persist()
    } else {
      isDiscarded = true
      for task in translationTasks.values { task.cancel() }
      archive?.delete(conversation.id)
    }
    await teardownTask?.value
  }

  func fail(_ failure: TranslatorFailure) {
    guard status == .live else { return }
    stopListening(then: .failed(failure))
  }

  func startListening() {
    let previousTeardown = teardownTask
    let request = TranscriptionRequest(mode: mode)
    listenTask = Task { [clients] in
      await previousTeardown?.value
      guard !Task.isCancelled else { return }
      do {
        let events = try await clients.transcription.start(request)
        for try await event in events { receive(event) }
        if !Task.isCancelled { fail(.interrupted) }
      } catch {
        if !Task.isCancelled { fail((error as? TranslatorFailure) ?? .interrupted) }
      }
    }
    tickTask = Task { [ticker, timing] in
      while !Task.isCancelled {
        do { try await ticker.sleep(timing.tickInterval) } catch { return }
        tick()
      }
    }
  }

  func stopListening(then newStatus: ConversationStatus) {
    let now = now()
    if let liveSince { accumulatedLiveTime += max(0, now.timeIntervalSince(liveSince)) }
    liveSince = nil
    status = newStatus
    silencePromptDeadline = nil
    liveSentence = nil
    cancelProvisionalTranslation()
    openTurnID = nil
    openTurnStartedAt = nil
    playbackQueue.removeAll()
    speakingSentenceID = nil
    speakingLanguage = nil
    micClosedForPlayback = false
    finishUtteranceRequested = false
    echoGuard.reset()
    listenTask?.cancel()
    listenTask = nil
    tickTask?.cancel()
    tickTask = nil
    playbackTask?.cancel()
    playbackTask = nil
    let previousTeardown = teardownTask
    teardownTask = Task { [clients] in
      await previousTeardown?.value
      await clients.playback.stop()
      await clients.transcription.stop()
    }
    persist()
  }

  func tick() {
    guard status == .live else { return }
    let now = now()
    if let deadline = silencePromptDeadline {
      if now >= deadline { pause(.silence) }
      return
    }
    if let startedAt = openTurnStartedAt, openTurn != nil {
      let paused = liveSentence == nil && now.timeIntervalSince(lastSpeechAt) >= timing.turnEndPause
      let tooLong = now.timeIntervalSince(startedAt) >= timing.longestTurn
      if paused || tooLong { closeOpenTurn() }
    }
    if liveSentence != nil, !finishUtteranceRequested,
      now.timeIntervalSince(lastVolatileChangeAt) >= timing.stalledSpeechPause
    {
      finishUtteranceRequested = true
      Task { [clients] in await clients.transcription.finishUtterance() }
    }
    if isQuiet, now.timeIntervalSince(lastSpeechAt) >= timing.silenceBeforePrompt {
      silencePromptDeadline = now.addingTimeInterval(timing.promptCountdown)
    }
  }

  var isQuiet: Bool {
    liveSentence == nil && openTurnID == nil && speakingSentenceID == nil
      && playbackQueue.isEmpty && translatingSentenceIDs.isEmpty
  }

  func persist() {
    guard !isDiscarded, hasSentences else { return }
    let now = now()
    conversation.updatedAt = now
    conversation.duration = elapsed(at: now)
    archive?.save(conversation)
  }

  func settle() async {
    for _ in 0..<10 {
      await teardownTask?.value
      for task in translationTasks.values { await task.value }
      await provisionalTask?.value
      await playbackTask?.value
      await Task.yield()
    }
  }
}
