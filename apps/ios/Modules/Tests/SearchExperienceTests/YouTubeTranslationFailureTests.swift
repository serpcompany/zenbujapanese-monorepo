import Foundation
import Synchronization
import Testing

@testable import SearchExperience

@Suite("YouTube translation failures")
struct YouTubeTranslationFailureTests {
  private final class RecordedProblems: Sendable {
    private let problems = Mutex<[HandledProblem]>([])

    func record(_ problem: HandledProblem) { problems.withLock { $0.append(problem) } }
    var all: [HandledProblem] { problems.withLock { $0 } }
  }

  private static let videoID = YouTubeVideoID(rawValue: "AQdI1o2D32I")!
  private static let trackURL =
    "https://www.youtube.com/api/timedtext?v=AQdI1o2D32I&lang=ja&signature=abc"
  private static let playerResponse = """
    {"playabilityStatus":{"status":"OK"},"videoDetails":{"title":"福","author":"Zenbu"},\
    "captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[\
    {"baseUrl":"\(trackURL)","languageCode":"ja","isTranslatable":true}]}}}
    """
  private static let japaneseLines = ["三番線です", "ドアが閉まります"]
  private static let japanese =
    #"<transcript><text start="0" dur="3">三番線です</text><text start="4" dur="3">ドアが閉まります</text></transcript>"#

  private static func watch(
    playerResponse: String = playerResponse,
    translation: @escaping @Sendable () throws -> Data
  ) async throws -> (cues: [SubtitleCue], recorded: [HandledProblem]) {
    let fetch = YouTubeFetch(
      playerResponse: { _ in Data(playerResponse.utf8) },
      timedText: { _, language in
        language == nil ? Data(japanese.utf8) : try translation()
      })
    let recorded = RecordedProblems()
    let client = YouTubeCaptionClient(fetching: fetch, recording: { recorded.record($0) })
    let captions = try await client.captions(videoID)
    return (captions.cues, recorded.all)
  }

  private static func refusal(_ status: Int) throws -> Data {
    let url = try #require(URL(string: "https://www.youtube.com/api/timedtext"))
    let response = try #require(
      HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil))
    return try YouTubeFetch.timedTextAnswer(Data("<html>Too Many Requests</html>".utf8), response)
  }

  @Test("a refused translation is recorded with its step and HTTP status, and the Japanese cues still show")
  func refusedTranslation() async throws {
    let (cues, recorded) = try await Self.watch { try Self.refusal(429) }
    #expect(
      recorded == [
        HandledProblem(
          area: .youTubeTranslation, code: "you_tube_caption_error.refused",
          details: ["step": "request", "status": "429"])
      ])
    #expect(cues.map(\.text) == Self.japaneseLines)
    #expect(cues.allSatisfy { $0.translation == nil })
  }

  @Test(
    "an unreadable translation is recorded with its step, and the Japanese cues still show",
    arguments: ["<html><body>Our systems have detected unusual traffic", ""])
  func unreadableTranslation(answer: String) async throws {
    let (cues, recorded) = try await Self.watch { Data(answer.utf8) }
    #expect(
      recorded == [
        HandledProblem(
          area: .youTubeTranslation, code: "you_tube_caption_error.unreadable_captions",
          details: ["step": "parse"])
      ])
    #expect(cues.map(\.text) == Self.japaneseLines)
    #expect(cues.allSatisfy { $0.translation == nil })
  }

  @Test("a timed-text answer passes on a 200 and names any other status it was refused with")
  func timedTextAnswerStatus() throws {
    #expect(throws: YouTubeCaptionError.refused(status: 429)) { try Self.refusal(429) }
    #expect(throws: YouTubeCaptionError.refused(status: 403)) { try Self.refusal(403) }
    #expect(try Self.refusal(200) == Data("<html>Too Many Requests</html>".utf8))
    let notHTTP = URLResponse(
      url: URL(fileURLWithPath: "/t"), mimeType: nil, expectedContentLength: 0,
      textEncodingName: nil)
    #expect(throws: YouTubeCaptionError.unreadableCaptions) {
      try YouTubeFetch.timedTextAnswer(Data(), notHTTP)
    }
  }

  @Test("a lost connection or a cancelled request records nothing, and the Japanese cues still show")
  func expectedFailuresRecordNothing() async throws {
    let failures: [any Error] = [
      URLError(.notConnectedToInternet), URLError(.timedOut), URLError(.cancelled),
      CancellationError(),
    ]
    for failure in failures {
      let (cues, recorded) = try await Self.watch { throw failure }
      #expect(recorded.isEmpty, "\(failure)")
      #expect(cues.map(\.text) == Self.japaneseLines, "\(failure)")
    }
  }

  @Test("nothing recorded names the video, its captions, or the request's address")
  func recordsNoVideoTextOrURL() async throws {
    let untrusted = URLError(
      .serverCertificateUntrusted,
      userInfo: [NSURLErrorFailingURLStringErrorKey: Self.trackURL + "&tlang=en"])
    let (_, recorded) = try await Self.watch { throw untrusted }
    let problem = try #require(recorded.first)
    #expect(problem.code == "nsurlerror_domain.-1202")
    #expect(problem.details == ["step": "request"])
    let described = String(describing: recorded)
    for secret in [Self.videoID.rawValue, "youtube.com", "timedtext", "福", "三番線"] {
      #expect(!described.contains(secret), "\(secret)")
    }
  }

  @Test("a track YouTube doesn't translate asks for no translation and records nothing")
  func untranslatableTrack() async throws {
    let response = Self.playerResponse.replacingOccurrences(
      of: #""isTranslatable":true"#, with: #""isTranslatable":false"#)
    let (cues, recorded) = try await Self.watch(playerResponse: response) {
      try Self.refusal(429)
    }
    #expect(cues.map(\.text) == Self.japaneseLines)
    #expect(recorded.isEmpty)
  }
}
