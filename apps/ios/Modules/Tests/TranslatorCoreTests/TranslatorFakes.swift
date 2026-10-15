import Foundation
import Observation
import os

@testable import TranslatorCore

@MainActor
func until(_ condition: @escaping @MainActor () -> Bool) async {
  while !condition(), !Task.isCancelled {
    let waiting = OSAllocatedUnfairLock<CheckedContinuation<Void, Never>?>(initialState: nil)
    let resume: @Sendable () -> Void = {
      waiting.withLock { held in
        defer { held = nil }
        return held
      }?.resume()
    }
    await withTaskCancellationHandler {
      await withCheckedContinuation { changed in
        waiting.withLock { $0 = changed }
        withObservationTracking { _ = condition() } onChange: { resume() }
        if Task.isCancelled { resume() }
      }
    } onCancel: {
      resume()
    }
  }
}

@MainActor
final class TestTime {
  var now = Date(timeIntervalSince1970: 1_800_000_000)

  func advance(_ seconds: TimeInterval) {
    now = now.addingTimeInterval(seconds)
  }
}

@MainActor
@Observable
final class FakeTranscription {
  private(set) var requests: [TranscriptionRequest] = []
  private(set) var hearing: [Bool] = []
  private(set) var stopCount = 0
  private(set) var finishCount = 0
  var failure: TranslatorFailure?
  @ObservationIgnored var onHearing: ((Bool) -> Void)?
  @ObservationIgnored private var continuation: AsyncThrowingStream<TranscriptionEvent, any Error>.Continuation?

  var client: TranscriptionClient {
    TranscriptionClient(
      start: { request in try await self.begin(request) },
      finishUtterance: { await self.recordFinish() },
      setHearing: { await self.recordHearing($0) },
      stop: { await self.recordStop() }
    )
  }

  func emit(_ event: TranscriptionEvent) {
    continuation?.yield(event)
  }

  func end() {
    continuation?.finish()
  }

  private func begin(_ request: TranscriptionRequest) throws -> AsyncThrowingStream<
    TranscriptionEvent, any Error
  > {
    requests.append(request)
    if let failure { throw failure }
    let (stream, continuation) = AsyncThrowingStream.makeStream(
      of: TranscriptionEvent.self, throwing: (any Error).self)
    self.continuation = continuation
    return stream
  }

  private func recordFinish() { finishCount += 1 }
  private func recordHearing(_ isHearing: Bool) {
    hearing.append(isHearing)
    onHearing?(isHearing)
  }

  private func recordStop() {
    stopCount += 1
    continuation?.finish()
    continuation = nil
  }
}

@MainActor
final class FakeTranslator {
  struct Call: Equatable {
    let text: String
    let language: SpokenLanguage
    let contextCount: Int
  }

  private(set) var calls: [Call] = []
  var failingTexts: Set<String> = []
  private var gate: CheckedContinuation<Void, Never>?
  var holdsTranslations = false

  var client: SentenceTranslationClient {
    SentenceTranslationClient { text, language, context in
      try await self.translate(text, language, context)
    }
  }

  static func translation(of text: String, from language: SpokenLanguage) -> String {
    "\(language.counterpart.rawValue):\(text)"
  }

  func release() {
    holdsTranslations = false
    gate?.resume()
    gate = nil
  }

  private func translate(
    _ text: String, _ language: SpokenLanguage, _ context: [TranslationContextLine]
  ) async throws -> String {
    calls.append(Call(text: text, language: language, contextCount: context.count))
    if holdsTranslations {
      await withCheckedContinuation { gate = $0 }
    }
    if failingTexts.contains(text) { throw TranslatorFailure.translationUnavailable }
    return Self.translation(of: text, from: language)
  }
}

@MainActor
@Observable
final class FakePlayback {
  struct Utterance: Equatable {
    let text: String
    let language: SpokenLanguage
  }

  private(set) var spoken: [Utterance] = []
  private(set) var stopCount = 0
  var reachesMicrophone = false
  var holdsSpeech = false
  @ObservationIgnored private var gate: CheckedContinuation<Void, Never>?

  var client: SpeechPlaybackClient {
    SpeechPlaybackClient(
      speak: { text, language in await self.speak(text, language) },
      stop: { await self.stop() },
      reachesMicrophone: { await self.reachesMicrophone }
    )
  }

  func finishSpeaking() {
    holdsSpeech = false
    gate?.resume()
    gate = nil
  }

  private func speak(_ text: String, _ language: SpokenLanguage) async {
    spoken.append(Utterance(text: text, language: language))
    if holdsSpeech { await withCheckedContinuation { gate = $0 } }
  }

  private func stop() {
    stopCount += 1
    gate?.resume()
    gate = nil
  }
}

@MainActor
final class FakeArchive: ConversationArchiving {
  private(set) var saved: [Conversation] = []
  private(set) var deleted: [UUID] = []

  func save(_ conversation: Conversation) { saved.append(conversation) }
  func delete(_ id: UUID) { deleted.append(id) }
}

@MainActor
struct ConversationHarness {
  let time = TestTime()
  let transcription = FakeTranscription()
  let translator = FakeTranslator()
  let playback = FakePlayback()
  let archive = FakeArchive()
  let session: LiveConversation

  init(mode: TranslateMode = .conversation) {
    var timing = ConversationTiming()
    timing.provisionalDelay = .zero
    timing.playbackTail = .zero
    let time = time
    session = LiveConversation(
      mode: mode,
      clients: TranslatorClients(
        transcription: transcription.client,
        translation: translator.client,
        playback: playback.client
      ),
      archive: archive,
      timing: timing,
      ticker: ConversationTicker { _ in try await Task.sleep(for: .seconds(86_400)) },
      now: { time.now }
    )
  }

  func hear(_ language: SpokenLanguage, _ text: String) async {
    session.receive(.final(language, text))
    await session.settle()
  }

  func pause(for seconds: TimeInterval) async {
    time.advance(seconds)
    session.tick()
    await session.settle()
  }

  func startAndWaitForListening() async {
    let asked = transcription.requests.count
    session.start()
    await until { transcription.requests.count > asked }
  }

  func startSpeaking(count: Int) async {
    time.advance(1.3)
    session.tick()
    await until { playback.spoken.count >= count }
  }
}
