import Foundation
import Testing

@testable import SearchExperience

@Suite("A saved conversation's day")
struct ConversationDateLabelTests {
  private let now = Date(timeIntervalSince1970: 1_800_000_000)
  private let hour: TimeInterval = 3600

  @Test("today and yesterday are named, with the time")
  func todayAndYesterday() {
    let earlier = now.addingTimeInterval(-hour)
    let dayBefore = now.addingTimeInterval(-24 * hour)
    #expect(
      ConversationDateLabel.text(for: earlier, now: now)
        == "Today, \(earlier.formatted(date: .omitted, time: .shortened))")
    #expect(
      ConversationDateLabel.text(for: dayBefore, now: now)
        == "Yesterday, \(dayBefore.formatted(date: .omitted, time: .shortened))")
  }

  @Test("an older day gives its date, and its year only when it isn't this year")
  func olderDays() {
    let thisYear = ConversationDateLabel.text(for: now.addingTimeInterval(-10 * 24 * hour), now: now)
    let lastYear = ConversationDateLabel.text(for: now.addingTimeInterval(-400 * 24 * hour), now: now)
    #expect(!thisYear.hasPrefix("Today") && !thisYear.hasPrefix("Yesterday"))
    #expect(!thisYear.contains("2027") && !thisYear.contains("2025"))
    #expect(lastYear.contains("2025"))
  }
}
