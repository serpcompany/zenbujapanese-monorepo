import Foundation

public enum TranscriptionEvent: Sendable, Equatable {
  case volatile(SpokenLanguage, String)
  case final(SpokenLanguage, String)
}

public struct TranscriptionRequest: Sendable, Equatable {
  public var languages: [SpokenLanguage]
  public var capture: CaptureProfile

  public init(languages: [SpokenLanguage], capture: CaptureProfile) {
    self.languages = languages
    self.capture = capture
  }

  public init(mode: TranslateMode) {
    self.init(languages: SpokenLanguage.allCases, capture: mode.capture)
  }
}

public enum TranslatorFailure: Error, Sendable, Equatable {
  case microphoneDenied
  case speechRecognitionUnavailable
  case translationUnavailable
  case audioUnavailable
  case interrupted
}

public struct TranscriptionClient: Sendable {
  public var start:
    @Sendable (TranscriptionRequest) async throws -> AsyncThrowingStream<TranscriptionEvent, any Error>
  public var finishUtterance: @Sendable () async -> Void
  public var setHearing: @Sendable (Bool) async -> Void
  public var stop: @Sendable () async -> Void

  public init(
    start: @escaping @Sendable (TranscriptionRequest) async throws -> AsyncThrowingStream<
      TranscriptionEvent, any Error
    >,
    finishUtterance: @escaping @Sendable () async -> Void,
    setHearing: @escaping @Sendable (Bool) async -> Void,
    stop: @escaping @Sendable () async -> Void
  ) {
    self.start = start
    self.finishUtterance = finishUtterance
    self.setHearing = setHearing
    self.stop = stop
  }
}

public struct TranslationContextLine: Sendable, Equatable {
  public var language: SpokenLanguage
  public var text: String
  public var translation: String

  public init(language: SpokenLanguage, text: String, translation: String) {
    self.language = language
    self.text = text
    self.translation = translation
  }
}

public struct SentenceTranslationClient: Sendable {
  public var translate:
    @Sendable (_ text: String, _ language: SpokenLanguage, _ context: [TranslationContextLine])
      async throws -> String

  public init(
    translate: @escaping @Sendable (String, SpokenLanguage, [TranslationContextLine]) async throws
      -> String
  ) {
    self.translate = translate
  }
}

public struct SpeechPlaybackClient: Sendable {
  public var speak: @Sendable (_ text: String, _ language: SpokenLanguage) async -> Void
  public var stop: @Sendable () async -> Void
  public var reachesMicrophone: @Sendable () async -> Bool

  public init(
    speak: @escaping @Sendable (String, SpokenLanguage) async -> Void,
    stop: @escaping @Sendable () async -> Void,
    reachesMicrophone: @escaping @Sendable () async -> Bool
  ) {
    self.speak = speak
    self.stop = stop
    self.reachesMicrophone = reachesMicrophone
  }
}

public struct TranslatorClients: Sendable {
  public var transcription: TranscriptionClient
  public var translation: SentenceTranslationClient
  public var playback: SpeechPlaybackClient

  public init(
    transcription: TranscriptionClient,
    translation: SentenceTranslationClient,
    playback: SpeechPlaybackClient
  ) {
    self.transcription = transcription
    self.translation = translation
    self.playback = playback
  }
}

public struct ConversationTicker: Sendable {
  public var sleep: @Sendable (Duration) async throws -> Void

  public init(sleep: @escaping @Sendable (Duration) async throws -> Void) {
    self.sleep = sleep
  }

  public static let continuous = ConversationTicker { try await Task.sleep(for: $0) }
}

public struct ConversationTiming: Sendable, Equatable {
  public var turnEndPause: TimeInterval = 0.8
  public var stalledSpeechPause: TimeInterval = 2.5
  public var longestTurn: TimeInterval = 30
  public var silenceBeforePrompt: TimeInterval = 170
  public var promptCountdown: TimeInterval = 10
  public var playbackTail: Duration = .milliseconds(250)
  public var provisionalDelay: Duration = .milliseconds(300)
  public var tickInterval: Duration = .milliseconds(200)
  public var contextSentences = 20

  public init() {}

  public static let standard = ConversationTiming()
}
