import Foundation
import TranslatorCore
import TranslatorOnDevice

struct ReplayResult: Codable, Sendable {
  var recording: String
  var turns: [[HeardSentence]]
  var score: Score
  var playbackDelays: [PlaybackDelay]
}

enum AudioOutcome: Sendable {
  case played
  case failed(String)
}

@MainActor
enum Replay {
  static let tail: Duration = .seconds(4)
  static let secondsPerJapaneseCharacter = 0.12
  static let secondsPerEnglishCharacter = 0.06
  static let speakingOverhead = 0.4

  static func run(_ recording: URL, script: Script, output: URL) async throws -> ReplayResult {
    #if DEBUG
      TranslateDiagnostics.shared.record(into: output)
    #endif
    try await OnDeviceSpeechAssets.install(SpokenLanguage.allCases) { _ in }
    let recognizer = BilingualRecognizer()
    let audio = RecordedAudio(url: recording.appending(path: "heard.wav"))
    let (outcomes, outcome) = AsyncStream.makeStream(of: AudioOutcome.self)
    let transcription = TranscriptionClient(
      start: { request in
        do {
          let session = try await recognizer.start(request.languages)
          Task {
            do {
              try await audio.play(into: session.feed, thenQuietFor: tail)
              outcome.yield(.played)
            } catch {
              outcome.yield(.failed(String(describing: error)))
            }
          }
          return session.events
        } catch {
          outcome.yield(.failed(String(describing: error)))
          throw error
        }
      },
      finishUtterance: { await recognizer.finishUtterance() },
      setHearing: { _ in },
      stop: { await recognizer.stop() }
    )
    let conversation = LiveConversation(
      mode: script.mode,
      clients: TranslatorClients(
        transcription: transcription, translation: .onDevice, playback: replayPlayback),
      archive: nil)
    conversation.start()
    for await result in outcomes {
      if case .failed(let reason) = result { throw ReplayFailure.audioFailed(reason) }
      break
    }
    if case .failed(let failure) = conversation.status {
      throw ReplayFailure.conversationFailed(failure)
    }
    await conversation.leave(saving: true)
    let turns = conversation.conversation.turns.map { turn in
      turn.sentences.map { HeardSentence(language: turn.language, text: $0.text) }
    }
    return ReplayResult(
      recording: recording.lastPathComponent,
      turns: turns,
      score: Scoring.score(script, heard: turns),
      playbackDelays: EventLog.playbackDelays(in: eventLog(in: output)))
  }

  private static let replayPlayback = SpeechPlaybackClient(
    speak: { text, language in
      #if DEBUG
        TranslateDiagnostics.shared.note("speak \(language.rawValue) \(text)")
      #endif
      try? await Task.sleep(for: .seconds(speakingTime(of: text, in: language)))
    },
    stop: {},
    reachesMicrophone: { false }
  )

  static func speakingTime(of text: String, in language: SpokenLanguage) -> Double {
    let perCharacter =
      language == .japanese ? secondsPerJapaneseCharacter : secondsPerEnglishCharacter
    return speakingOverhead + perCharacter * Double(text.count)
  }

  private static func eventLog(in output: URL) -> String {
    let folders =
      (try? FileManager.default.contentsOfDirectory(
        at: output, includingPropertiesForKeys: nil)) ?? []
    return folders.sorted { $0.path < $1.path }.compactMap {
      try? String(contentsOf: $0.appending(path: "events.log"), encoding: .utf8)
    }.last ?? ""
  }
}
