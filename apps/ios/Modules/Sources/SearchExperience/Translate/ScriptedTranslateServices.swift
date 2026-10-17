import Foundation
import TranslatorCore

extension TranslateServices {
  static var forThisLaunch: TranslateServices {
    #if DEBUG
      let environment = ProcessInfo.processInfo.environment
      if let name = environment["ZENBU_TRANSLATE_SCRIPT"], let script = TranslateScript(rawValue: name) {
        return .scripted(script, holds: ScriptedHolds.forThisLaunch(environment))
      }
    #endif
    return .onDevice
  }
}

#if DEBUG
  enum TranslateScript: String {
    case station

    struct Line {
      let language: SpokenLanguage
      let text: String
      let translation: String
      let continuesTurn: Bool
    }

    static let conversation: [Line] = [
      Line(language: .english, text: "Excuse me, how do I get to Tokyo Station?", translation: "すみません、東京駅にはどうやって行けばいいですか？", continuesTurn: false),
      Line(language: .japanese, text: "この先の階段を下りて、右に曲がってください。", translation: "Go down the stairs ahead and turn right.", continuesTurn: false),
      Line(language: .japanese, text: "突き当たりに改札がありますが、出ないでください。", translation: "There's a ticket gate at the end, but don't go through it.", continuesTurn: true),
      Line(language: .japanese, text: "そのまま五番線まで進んでください。", translation: "Keep going to Track 5.", continuesTurn: true),
      Line(language: .english, text: "Is the rapid train faster than the local?", translation: "快速は各駅停車より早いですか？", continuesTurn: false),
      Line(language: .japanese, text: "はい、東京駅は三つ目の駅です。", translation: "Yes, Tokyo Station is the third stop.", continuesTurn: false),
      Line(language: .english, text: "Thank you so much!", translation: "ありがとうございます！", continuesTurn: false),
    ]

    static let announcements: [Line] = [
      Line(language: .japanese, text: "今夜までに雨は止み、明日は関東全域で晴れるでしょう。", translation: "The rain will stop by this evening, and tomorrow will be sunny across the Kanto region.", continuesTurn: false),
      Line(language: .japanese, text: "東京の最高気温は24度の予想です。", translation: "Highs in Tokyo will reach 24 degrees.", continuesTurn: true),
      Line(language: .japanese, text: "続いてスポーツです。", translation: "Next, the sports news.", continuesTurn: true),
      Line(language: .english, text: "The next train to Shinjuku leaves from Track 3.", translation: "新宿行きの次の電車は3番線から発車します。", continuesTurn: false),
    ]

    static let typed: [String: String] = [
      "駅まで歩いて何分ですか？": "How many minutes is it to the station on foot?",
      "トイレはどこですか？": "Where is the restroom?",
      "Where can I buy a Suica card?": "Suicaカードはどこで買えますか？",
      "How much is this?": "これはいくらですか？",
    ]

    static func translation(of text: String, from language: SpokenLanguage) -> String {
      if let line = (conversation + announcements).first(where: { $0.text == text }) {
        return line.translation
      }
      if let typed = typed[text] { return typed }
      return language == .japanese
        ? "This is where the English translation appears."
        : "ここに日本語訳が表示されます。"
    }
  }

  actor ScriptedTranscriber {
    private let holds: ScriptedHolds?
    private var nextLine: [Bool: Int] = [:]
    private var isHearing = true
    private var task: Task<Void, Never>?
    private var continuation: AsyncThrowingStream<TranscriptionEvent, any Error>.Continuation?

    init(holds: ScriptedHolds?) {
      self.holds = holds
    }

    func start(_ request: TranscriptionRequest) -> AsyncThrowingStream<TranscriptionEvent, any Error> {
      stop()
      let listening = request.capture == .distantSound
      let lines = listening ? TranslateScript.announcements : TranslateScript.conversation
      let (stream, continuation) = AsyncThrowingStream.makeStream(
        of: TranscriptionEvent.self, throwing: (any Error).self)
      self.continuation = continuation
      task = Task {
        var isFirstLine = true
        while nextLine[listening, default: 0] < lines.count {
          let index = nextLine[listening, default: 0]
          let line = lines[index]
          do {
            try await waitToBegin(line, isFirstLine: isFirstLine)
            while !isHearing { try await Task.sleep(for: .milliseconds(200)) }
            let prefixes = Self.growingPrefixes(of: line)
            for (place, prefix) in prefixes.enumerated() {
              if place == prefixes.count / 2 { try await holds?.hearing.wait() }
              continuation.yield(.volatile(line.language, prefix))
              try await Task.sleep(for: .milliseconds(line.language == .japanese ? 140 : 180))
            }
          } catch {
            return
          }
          continuation.yield(.final(line.language, line.text))
          nextLine[listening] = index + 1
          isFirstLine = false
        }
      }
      return stream
    }

    func setHearing(_ hearing: Bool) {
      isHearing = hearing
    }

    private func waitToBegin(_ line: TranslateScript.Line, isFirstLine: Bool) async throws {
      guard let holds else {
        return try await Task.sleep(for: .seconds(line.continuesTurn ? 0.4 : 2))
      }
      if !isFirstLine || holds.startsSilent, !line.continuesTurn { try await holds.hearing.wait() }
    }

    func stop() {
      task?.cancel()
      task = nil
      continuation?.finish()
      continuation = nil
      isHearing = true
    }

    private static func growingPrefixes(of line: TranslateScript.Line) -> [String] {
      if line.language == .english {
        let words = line.text.split(separator: " ")
        return words.indices.map { words[...$0].joined(separator: " ") }
      }
      let characters = Array(line.text)
      return stride(from: 2, to: characters.count, by: 2).map { String(characters[..<$0]) }
    }
  }

  extension TranslateServices {
    private static let longerThanAnyTest: TimeInterval = 3600

    static func scripted(_ script: TranslateScript, holds: ScriptedHolds? = nil) -> TranslateServices {
      let transcriber = ScriptedTranscriber(holds: holds)
      let clock = ScriptedClock()
      var timing = ConversationTiming.standard
      timing.silenceBeforePrompt = holds.map { $0.startsSilent ? 20 : Self.longerThanAnyTest } ?? 20
      timing.longestTurn = holds == nil ? timing.longestTurn : Self.longerThanAnyTest
      timing.promptCountdown = 120
      clock.skipsAheadOnNotice(by: timing.promptCountdown)
      return TranslateServices(
        clients: TranslatorClients(
          transcription: TranscriptionClient(
            start: { await transcriber.start($0) },
            finishUtterance: {},
            setHearing: { await transcriber.setHearing($0) },
            stop: { await transcriber.stop() }
          ),
          translation: SentenceTranslationClient { text, language, _ in
            try await Task.sleep(for: .milliseconds(300))
            return TranslateScript.translation(of: text, from: language)
          },
          playback: SpeechPlaybackClient(
            speak: { text, _ in
              do { try await holds?.playing.wait() } catch { return }
              try? await Task.sleep(for: .seconds(max(1, Double(text.count) * 0.06)))
            },
            stop: { await holds?.playing.cutShort() },
            reachesMicrophone: { false }
          )
        ),
        requestMicrophone: { true },
        translationAvailability: { .installed },
        speechNeedsDownload: { _ in false },
        installSpeech: { _, _ in },
        timing: timing,
        now: { clock.now }
      )
    }
  }
#endif
