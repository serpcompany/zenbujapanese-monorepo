import Foundation
import Testing

@testable import SearchExperience

@Suite("Account's progress wording")
struct ProgressWordingTests {
  private let tokyo = TimeZone(identifier: "Asia/Tokyo")!

  private func day(_ name: String) -> Date {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = tokyo
    return ProgressWeek.date(of: name, in: calendar)!
  }

  @Test func paceDates() {
    let today = day("2026-10-28")
    let late = JLPTCoverage.Pace(date: "2026-12-31", days: 64)
    let next = JLPTCoverage.Pace(date: "2027-02-24", days: 119)
    #expect(ProgressWording.paceDate(late, today: today, timeZone: tokyo) == day("2026-12-31")
      .formatted(Date.FormatStyle(timeZone: tokyo).month(.abbreviated).day()))
    #expect(ProgressWording.paceDate(next, today: today, timeZone: tokyo) == day("2027-02-24")
      .formatted(Date.FormatStyle(timeZone: tokyo).month(.abbreviated).day().year()))
    #expect(ProgressWording.paceDate(nil, today: today, timeZone: tokyo) == "Done")
  }

  @Test func wordsAndMonths() {
    #expect(ProgressWording.newWords(1) == "1 new word")
    #expect(ProgressWording.newWords(20) == "20 new words")
    #expect(ProgressWording.ofGoal(12, 20) == "12 of 20 new words")
    #expect(ProgressWording.perMonth(20) == 600)
  }
}
