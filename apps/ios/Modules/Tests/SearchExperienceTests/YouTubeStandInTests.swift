import Foundation
import Testing

@testable import SearchExperience

@Suite("YouTube stand-in for UI tests")
struct YouTubeStandInTests {
  private static func standIn(captionTracks: String) throws -> LaunchHarness.YouTubeStandIn {
    let response = """
      {"playabilityStatus":{"status":"OK"},"videoDetails":{"title":"Platform","author":"Zenbu"},\
      "captions":{"playerCaptionsTracklistRenderer":{"captionTracks":\(captionTracks)}}}
      """
    let fixture: [String: Any] = [
      "playerResponse": response,
      "japanese": #"<transcript><text start="0" dur="3">三番線です</text><text start="4" dur="3">ドアが閉まります</text></transcript>"#,
      "english": #"<transcript><text start="0" dur="3">This is track 3.</text><text start="4" dur="3">The doors are closing.</text></transcript>"#,
      "duration": 8,
    ]
    let json = String(decoding: try JSONSerialization.data(withJSONObject: fixture), as: UTF8.self)
    return try #require(LaunchHarness.youTubeStandIn([LaunchHarness.youTubeStandInKey: json]))
  }

  @Test("the stand-in's captions go through the same parsing, track choice, and pairing as YouTube's")
  func captions() async throws {
    let standIn = try Self.standIn(
      captionTracks: #"[{"baseUrl":"https://stand-in.test/ja","languageCode":"ja","isTranslatable":true}]"#)
    let id = try #require(YouTubeVideoID(rawValue: "AQdI1o2D32I"))
    let captions = try await YouTubeCaptionClient(fetching: standIn.fetch).captions(id)
    #expect(captions.title == "Platform")
    #expect(captions.cues.map(\.text) == ["三番線です", "ドアが閉まります"])
    #expect(captions.cues.map(\.translation) == ["This is track 3.", "The doors are closing."])
    #expect(standIn.playerScript.contains("duration = 8.0"))
  }

  @Test("a video without a Japanese track says so, as YouTube's would")
  func noJapanese() async throws {
    let standIn = try Self.standIn(captionTracks: "[]")
    let id = try #require(YouTubeVideoID(rawValue: "AQdI1o2D32I"))
    await #expect(throws: YouTubeCaptionError.noJapaneseCaptions) {
      try await YouTubeCaptionClient(fetching: standIn.fetch).captions(id)
    }
  }
}
