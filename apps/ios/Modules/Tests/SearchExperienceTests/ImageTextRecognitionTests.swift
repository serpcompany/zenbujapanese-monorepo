import Foundation
import Testing
@testable import SearchExperience

@Suite("Image text recognition")
struct ImageTextRecognitionTests {
  @Test("vertical Japanese is read in right-to-left column order")
  func verticalColumns() async throws {
    let lines = try await recognizedLines("vertical-proverbs.png")
    let first = try #require(lines.firstIndex(of: "木を見て森を見ず"))
    let second = try #require(lines.firstIndex(of: "机上の空論"))
    let last = try #require(lines.firstIndex(of: "先んずれば人を制す"))
    #expect(first < second && second < last)
  }

  @Test("a horizontal English subtitle does not hide vertical Japanese")
  func verticalWithEnglishSubtitle() async throws {
    let lines = try await recognizedLines("vertical-with-english-subtitle.png")
    #expect(lines.first == "人生の時計")
    #expect(lines.contains("あなたの年齢を三で割ると"))
    #expect(lines.contains { $0.contains("Clock of Life") })
  }

  @Test("a photographed vertical book page is recognized")
  func verticalPhoto() async throws {
    let text = try await recognizedLines("vertical-novel-page-photo.jpg").joined()
    #expect(text.contains("家族って「ある」ものじゃなかった"))
    #expect(text.contains("母さん"))
  }

  @Test("vertical characters have per-character boxes stacked down the column")
  func verticalCharacterBoxes() async throws {
    let observations = try await recognize("vertical-with-english-subtitle.png")
    let title = try #require(observations.first { $0.text == "人生の時計" })
    #expect(title.characterBoxes.count == 5)
    #expect(title.characterBoxes.allSatisfy { !$0.isNull && !$0.isEmpty })
    let tops = title.characterBoxes.map(\.midY)
    #expect(tops == tops.sorted(by: >))
  }

  @Test("horizontal Japanese is still recognized")
  func horizontal() async throws {
    let lines = try await recognizedLines("horizontal-japanese.png")
    #expect(lines == ["駅の近くに本屋があります", "毎朝コーヒーを飲みます"])
  }

  private func recognizedLines(_ name: String) async throws -> [String] {
    try await recognize(name).map(\.text)
  }

  private func recognize(_ name: String) async throws -> [RecognizedImageTextObservation] {
    let url = try #require(
      Bundle.module.url(forResource: name, withExtension: nil, subdirectory: "Fixtures/ImageText")
    )
    let asset = ImageTextAsset(name: name, data: try Data(contentsOf: url))
    return try await ImageTextRecognitionClient.live.recognize(asset)
  }
}
