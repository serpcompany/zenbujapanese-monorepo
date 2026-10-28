import Foundation

enum ProgressWording {
  static let goalMet = "Goal met"
  static let goalMetInLine = "goal met"

  static func newWords(_ count: Int) -> String {
    String(AttributedString(localized: "^[\(count) new word](inflect: true)").characters)
  }

  static func words(_ count: Int) -> String {
    String(AttributedString(localized: "^[\(count) word](inflect: true)").characters)
  }

  static func days(_ count: Int) -> String {
    String(AttributedString(localized: "^[\(count) day](inflect: true)").characters)
  }

  static func ofGoal(_ added: Int, _ goal: Int) -> String {
    "\(added) of \(newWords(goal))"
  }

  static func streak(_ days: Int) -> String {
    "\(days)-day streak"
  }

  static func moreToGo(_ count: Int) -> String {
    "\(count) more to go"
  }

  static func ofToday(_ goal: Int) -> String {
    "of \(goal) today"
  }

  static func inLastWeek(_ count: Int) -> String {
    "+\(count.formatted()) in 7 days"
  }

  static func lastDays(_ count: Int) -> String {
    "last \(days(count))"
  }

  static func average(_ average: Double) -> String {
    average.formatted(.number.precision(.fractionLength(0...1)))
  }

  static func perMonth(_ goal: Int) -> Int {
    goal * 30
  }

  static func paceDate(
    _ pace: JLPTCoverage.Pace?, today: Date = .now, timeZone: TimeZone = .autoupdatingCurrent
  ) -> String {
    guard let pace else { return "Done" }
    return shortDate(pace.date, today: today, timeZone: timeZone)
  }

  static func shortDate(
    _ name: String, today: Date = .now, timeZone: TimeZone = .autoupdatingCurrent
  ) -> String {
    let calendar = ProgressWeek.gregorian(in: timeZone)
    guard let date = ProgressWeek.date(of: name, in: calendar) else { return name }
    let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: today)
    let format = Date.FormatStyle(timeZone: timeZone).month(.abbreviated).day()
    return date.formatted(sameYear ? format : format.year())
  }

  static func streakDays(
    _ streak: ProgressStats.Streak, today: Date = .now, timeZone: TimeZone = .autoupdatingCurrent
  ) -> String {
    let first = shortDate(streak.first, today: today, timeZone: timeZone)
    guard streak.first != streak.last else { return first }
    return "\(first) – \(shortDate(streak.last, today: today, timeZone: timeZone))"
  }

  static func dayLine(_ day: ProgressStats.Day, timeZone: TimeZone = .autoupdatingCurrent) -> String {
    let date = ProgressWeek.date(of: day.day, in: ProgressWeek.gregorian(in: timeZone))
    let named = date.map {
      $0.formatted(Date.FormatStyle(timeZone: timeZone).weekday(.abbreviated).month(.abbreviated).day())
    }
    return [named ?? day.day, words(day.added), day.met ? goalMetInLine : "goal \(day.goal)"]
      .joined(separator: " · ")
  }

  static func goalMetDays(_ goalMet: ProgressStats.GoalMet, words added: Int) -> String {
    guard goalMet.days > 0 else { return "\(words(added)) so far" }
    return "Goal met \(goalMet.met) of \(days(goalMet.days)) · \(words(added))"
  }

  static func percentKnown(_ level: JLPTCoverage.Level) -> String {
    level.percentKnown == 0 && level.known > 0 ? "<1% known" : "\(level.percentKnown)% known"
  }

  static func levelCounts(_ level: JLPTCoverage.Level) -> String {
    "\(percentKnown(level)) · \(level.known.formatted()) / \(level.words.formatted())"
  }

  static func knownOnDay(
    _ point: ProgressStats.KnownOnDay, isToday: Bool, today: Date = .now,
    timeZone: TimeZone = .autoupdatingCurrent
  ) -> String {
    let day = isToday ? "Today" : shortDate(point.day, today: today, timeZone: timeZone)
    return "\(day) · \(point.known.formatted())"
  }
}
