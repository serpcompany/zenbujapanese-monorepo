import Foundation

struct DailyList: Identifiable, Hashable, Sendable {
  let list: WordList
  let day: String

  var id: UUID { list.id }
}

struct DailyListGroup: Identifiable, Hashable, Sendable {
  let heading: String
  var lists: [DailyList]

  var id: String { heading }
}

extension WordLists {
  nonisolated static func day(of listID: UUID) -> String? {
    AccountRules.shared.dailyListDay(listID)
  }

  var ownLists: [WordList] {
    lists.filter { !Self.isDaily($0.id) }
  }

  var dailyLists: [DailyList] {
    lists.compactMap { list in Self.day(of: list.id).map { DailyList(list: list, day: $0) } }
      .sorted { $0.day > $1.day }
  }

  nonisolated static func isDaily(_ listID: UUID) -> Bool {
    Self.day(of: listID) != nil
  }
}

enum DailyListDays {
  private static let utc: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .gmt
    return calendar
  }()

  static func date(of day: String) -> Date? {
    ProgressWeek.date(of: day, in: utc)
  }

  static func day(_ day: String, movedBy count: Int) -> String? {
    date(of: day)
      .flatMap { utc.date(byAdding: .day, value: count, to: $0) }
      .map { ProgressLog.day(of: $0, in: utc) }
  }

  static func name(of day: String, locale: Locale = .autoupdatingCurrent) -> String {
    formatted(day, Date.FormatStyle(date: .abbreviated, time: .omitted, locale: locale))
  }

  static func title(of day: String, today: String, locale: Locale = .autoupdatingCurrent) -> String {
    if day == today { return String(localized: "Today") }
    if day == Self.day(today, movedBy: -1) { return String(localized: "Yesterday") }
    return formatted(day, Date.FormatStyle(locale: locale).weekday(.wide).month(.abbreviated).day())
  }

  static func groups(
    _ lists: [DailyList], today: String, locale: Locale = .autoupdatingCurrent
  ) -> [DailyListGroup] {
    let weekStart = day(today, movedBy: -6) ?? today
    var groups: [DailyListGroup] = []
    for list in lists.sorted(by: { $0.day > $1.day }) {
      let heading =
        list.day >= weekStart
        ? String(localized: "This week")
        : formatted(list.day, Date.FormatStyle(locale: locale).month(.wide).year())
      if groups.last?.heading == heading {
        groups[groups.count - 1].lists.append(list)
      } else {
        groups.append(DailyListGroup(heading: heading, lists: [list]))
      }
    }
    return groups
  }

  private static func formatted(_ day: String, _ style: Date.FormatStyle) -> String {
    var style = style
    style.timeZone = .gmt
    return date(of: day)?.formatted(style) ?? day
  }
}
