import Foundation
import Testing

@testable import SearchExperience

@Suite("Known words by date")
struct KnownByDateTests {
  private let tokyo = TimeZone(identifier: "Asia/Tokyo")!
  private let taberu = "042e07f7052f611fed33ddddf37f55fd"
  private let miru = "7f490a9c9c0da94f4e9474f4efe74be1"

  private func named(_ name: String, _ format: Date.FormatStyle) -> String {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = tokyo
    return ProgressWeek.date(of: name, in: calendar)!.formatted(format)
  }

  @Test func theWeekAndItsChange() {
    #expect(ProgressWording.markedKnown(38) == "38 marked Known")
    #expect(ProgressWording.versusWeekBefore(-9) == "\u{2212}9 vs the week before")
    #expect(ProgressWording.versusWeekBefore(7) == "+7 vs the week before")
    #expect(ProgressWording.versusWeekBefore(0) == "+0 vs the week before")
    let day = KnownByDate.Day(day: "2026-10-28", markedKnown: [taberu], count: 1)
    let weekday = Date.FormatStyle(timeZone: tokyo).weekday(.abbreviated).month(.abbreviated).day()
    #expect(ProgressWording.knownDayLine(day, timeZone: tokyo)
      == "\(named("2026-10-28", weekday)) · 1 marked Known")
    let short = Date.FormatStyle(timeZone: tokyo).month(.abbreviated).day()
    let week = ["2026-10-15", "2026-10-21"].map { KnownByDate.Day(day: $0, markedKnown: [], count: 0) }
    #expect(ProgressWording.knownWeek([week[0], day], today: "2026-10-28", timeZone: tokyo)
      == "\(named("2026-10-15", short)) – Today")
    #expect(ProgressWording.knownWeek(week, today: "2026-10-28", timeZone: tokyo)
      == "\(named("2026-10-15", short)) – \(named("2026-10-21", short))")
  }

  @Test func eachDaysSectionAndTheFooter() {
    let today = "2026-10-28"
    #expect(ProgressWording.knownDaySection(today, today: today, timeZone: tokyo) == "Today")
    #expect(ProgressWording.knownDaySection("2026-10-27", today: today, timeZone: tokyo) == "Yesterday")
    let wide = Date.FormatStyle(timeZone: tokyo).weekday(.wide).month(.abbreviated).day()
    #expect(ProgressWording.knownDaySection("2026-10-26", today: today, timeZone: tokyo)
      == named("2026-10-26", wide))
    #expect(ProgressWording.knownDaySection("2025-12-30", today: today, timeZone: tokyo)
      == named("2025-12-30", wide.year()))
    let full = Date.FormatStyle(timeZone: tokyo).month(.abbreviated).day().year()
    #expect(ProgressWording.datesStart("2026-10-30", timeZone: tokyo)
      == "Dates start \(named("2026-10-30", full)), when Zenbu began keeping them.")
  }

  @Test func aWordWithNoRecordNowStillShowsUntagged() {
    let kept = WordKnowledgeRecord(
      entryID: taberu, headword: "食べる", reading: "たべる", status: .learning, updatedAt: .now)
    let day = KnownByDate.Day(day: "2026-10-28", markedKnown: [taberu, miru, "kanji:語"], count: 3)
    let records = day.records(in: [taberu: kept])
    #expect(records.map(\.entryID) == [taberu, miru, "kanji:語"])
    #expect(records[0] == kept)
    #expect(records[1].status == .unknown && records[1].headword.isEmpty)
    #expect(records[2].status == .unknown && records[2].kanji?.rawValue == "語")
  }
}
