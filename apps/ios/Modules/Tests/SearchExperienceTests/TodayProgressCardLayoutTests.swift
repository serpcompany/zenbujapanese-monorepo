import SwiftUI
import Testing

@testable import SearchExperience

@Suite("Account's Today card layout")
@MainActor
struct TodayProgressCardLayoutTests {
  @Test(arguments: [DynamicTypeSize.large, .accessibility3, .accessibility5])
  func theCardFitsARowAtEveryTextSize(_ size: DynamicTypeSize) throws {
    let row = 320.0
    let renderer = ImageRenderer(
      content: TodayProgressCard(stats: nil, goal: 5).environment(\.dynamicTypeSize, size))
    renderer.proposedSize = ProposedViewSize(width: row, height: nil)
    renderer.scale = 1
    let width = try #require(renderer.cgImage?.width)
    #expect(Double(width) <= row, "the card is \(width) points wide in a \(row)-point row at \(size)")
  }
}
