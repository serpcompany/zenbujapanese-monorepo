import Foundation
import Testing

@testable import SearchExperience

@Suite("Account's and Progress's wording")
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

  @Test func todaySpokenTheSameOnBothScreens() {
    struct Today: ShowsTodaysProgress {
      let stats: ProgressStats? = nil
      let goal = 5
    }
    #expect(Today().spokenToday(sayingWhatsLeft: false) == "Today, 0 of 5 new words")
    #expect(Today().spokenToday(sayingWhatsLeft: true) == "Today, 0 of 5 new words, 5 more to go")
  }

  @Test func wordsAndMonths() {
    #expect(ProgressWording.newWords(1) == "1 new word")
    #expect(ProgressWording.newWords(20) == "20 new words")
    #expect(ProgressWording.ofGoal(12, 20) == "12 of 20 new words")
    #expect(ProgressWording.perMonth(20) == 600)
    #expect(ProgressWording.words(1) == "1 word")
    #expect(ProgressWording.days(7) == "7 days")
    #expect(ProgressWording.moreToGo(8) == "8 more to go")
    #expect(ProgressWording.ofToday(20) == "of 20 today")
    #expect(ProgressWording.inLastWeek(1_038) == "+\(1_038.formatted()) in 7 days")
    #expect(ProgressWording.lastDays(1) == "last 1 day")
    #expect(ProgressWording.average(11.0 / 7) == 1.6.formatted())
    #expect(ProgressWording.average(22) == "22")
  }

  @Test func streakDays() {
    let today = day("2026-10-28")
    let short = Date.FormatStyle(timeZone: tokyo).month(.abbreviated).day()
    let run = ProgressStats.Streak(length: 7, first: "2026-10-14", last: "2026-10-20")
    #expect(ProgressWording.streakDays(run, today: today, timeZone: tokyo)
      == "\(day("2026-10-14").formatted(short)) – \(day("2026-10-20").formatted(short))")
    let one = ProgressStats.Streak(length: 1, first: "2026-10-14", last: "2026-10-14")
    #expect(ProgressWording.streakDays(one, today: today, timeZone: tokyo) == day("2026-10-14").formatted(short))
  }

  @Test func aDayAndItsGoal() {
    let named = day("2026-10-27")
      .formatted(Date.FormatStyle(timeZone: tokyo).weekday(.abbreviated).month(.abbreviated).day())
    let met = ProgressStats.Day(day: "2026-10-27", added: 26, markedKnown: 0, goal: 20, met: true)
    let short = ProgressStats.Day(day: "2026-10-27", added: 1, markedKnown: 0, goal: 20, met: false)
    #expect(ProgressWording.dayLine(met, timeZone: tokyo) == "\(named) · 26 words · goal met")
    #expect(ProgressWording.dayLine(short, timeZone: tokyo) == "\(named) · 1 word · goal 20")
    #expect(ProgressWording.goalMetDays(ProgressStats.GoalMet(met: 6, days: 6), words: 131)
      == "Goal met 6 of 6 days · 131 words")
    #expect(ProgressWording.goalMetDays(ProgressStats.GoalMet(met: 0, days: 0), words: 0) == "0 words so far")
  }

  @Test func levelsAndKnownOverTime() {
    let level = { (known: Int, percent: Int) in
      JLPTCoverage.Level(
        level: 2, name: "N2", words: 1738, known: known, learning: 3, notStarted: 0,
        percentKnown: percent, upNext: [], pace: nil)
    }
    #expect(ProgressWording.levelCounts(level(6, 0)) == "<1% known · 6 / \(1738.formatted())")
    #expect(ProgressWording.percentKnown(level(0, 0)) == "0% known")
    #expect(ProgressWording.percentKnown(level(782, 45)) == "45% known")
    let point = ProgressStats.KnownOnDay(day: "2026-09-09", known: 174)
    let today = day("2026-10-28")
    #expect(ProgressWording.knownOnDay(point, isToday: false, today: today, timeZone: tokyo)
      == "\(day("2026-09-09").formatted(Date.FormatStyle(timeZone: tokyo).month(.abbreviated).day())) · 174")
    #expect(ProgressWording.knownOnDay(point, isToday: true, today: today, timeZone: tokyo) == "Today · 174")
  }
}
