import CoreGraphics
import Foundation
import Testing
@testable import SearchExperience

@Suite("Image text context notes")
struct ImageTextContextNotesTests {
  private func line(_ id: Int, _ text: String) -> ImageTextLine {
    ImageTextLine(
      id: id, text: text,
      boundingBox: CGRect(x: 0.9 - Double(id) * 0.1, y: 0.5, width: 0.05, height: 0.4),
      isVertical: true)
  }

  private func note(_ phrase: String) -> ImageTextNote {
    ImageTextNote(phrase: phrase, entry: .fixture(id: phrase, headword: phrase))
  }

  @Test("an idiom that is a whole paragraph isn't repeated under Context")
  func skipsWholeParagraphIdioms() {
    let paragraphs = [
      ImageTextParagraph(lines: [line(0, "木を見て森を見ず")]),
      ImageTextParagraph(lines: [line(1, "背水の陣で挑んだ。")]),
    ]
    let insights = ImageTextInsights(
      context: "A list of proverbs.",
      notes: [note("木を見て森を見ず"), note("背水の陣")]
    )

    #expect(insights.notes(notRepeating: paragraphs).map(\.phrase) == ["背水の陣"])
  }
}
