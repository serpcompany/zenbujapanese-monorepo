import SwiftUI

struct AccountProgressSection: View {
  @Environment(ProgressLog.self) private var progressLog
  @AppStorage(DailyGoal.key) private var storedGoal = Double(DailyGoal.standard)
  @State private var stats: ProgressStats?
  @State private var choosesGoal = false

  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  private var goal: Int { DailyGoal.clamped(storedGoal) }

  private var rowLayout: AnyLayout {
    dynamicTypeSize.isAccessibilitySize
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
      : AnyLayout(HStackLayout())
  }

  var body: some View {
    Section {
      TodayProgressCard(stats: stats, goal: goal)
        .task(id: StatsAsked(days: progressLog.days, goal: goal, today: progressLog.today)) {
          stats = await progressLog.stats()
        }
      Button {
        choosesGoal = true
      } label: {
        HStack {
          rowLayout {
            SettingsRowLabel("Daily Goal", systemImage: "target", tint: .green)
            Spacer(minLength: 0)
            Text(ProgressWording.newWords(goal))
              .foregroundStyle(.secondary)
          }
          Image(systemName: "chevron.forward")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.tertiary)
            .accessibilityHidden(true)
        }
      }
      .foregroundStyle(.primary)
      .accessibilityIdentifier("account.daily-goal")
      .sheet(isPresented: $choosesGoal) {
        DailyGoalSheet(goal: goal) { DailyGoal.write($0, to: .standard) }
      }
    }
  }

  private struct StatsAsked: Equatable {
    let days: [String: ProgressLogDay]
    let goal: Int
    let today: String
  }
}

enum ProgressWording {
  static func newWords(_ count: Int) -> String {
    String(AttributedString(localized: "^[\(count) new word](inflect: true)").characters)
  }

  static func ofGoal(_ added: Int, _ goal: Int) -> String {
    "\(added) of \(newWords(goal))"
  }

  static func streak(_ days: Int) -> String {
    "\(days)-day streak"
  }

  static func perMonth(_ goal: Int) -> Int {
    goal * 30
  }

  static func paceDate(
    _ pace: JLPTCoverage.Pace?, today: Date = .now, timeZone: TimeZone = .autoupdatingCurrent
  ) -> String {
    guard let pace else { return "Done" }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    guard let date = ProgressWeek.date(of: pace.date, in: calendar) else { return pace.date }
    let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: today)
    let format = Date.FormatStyle(timeZone: timeZone).month(.abbreviated).day()
    return date.formatted(sameYear ? format : format.year())
  }
}

struct TodayProgressCard: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @ScaledMetric(relativeTo: .title3) private var ringSize = 58.0
  let stats: ProgressStats?
  let goal: Int

  private var added: Int { stats?.today.added ?? 0 }
  private var todaysGoal: Int { stats?.today.goal ?? goal }
  private var met: Bool { stats?.today.met ?? false }
  private var streak: Int { stats?.streak ?? 0 }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      summary
      ProgressWeekStrip(stats: stats)
      if streak > 0 {
        Label {
          Text(ProgressWording.streak(streak)).fontWeight(.semibold)
        } icon: {
          Image(systemName: "flame.fill").foregroundStyle(.orange)
        }
      }
    }
    .padding(.vertical, 6)
    .redacted(reason: stats == nil ? .placeholder : [])
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(spoken)
    .accessibilityIdentifier("account.progress.today")
  }

  private var summary: some View {
    let layout =
      dynamicTypeSize.isAccessibilitySize
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
      : AnyLayout(HStackLayout(spacing: 16))
    return layout {
      ZStack {
        Circle()
          .stroke(.orange.opacity(0.2), lineWidth: ringSize / 9)
        Circle()
          .trim(from: 0, to: todaysGoal > 0 ? min(Double(added) / Double(todaysGoal), 1) : 0)
          .stroke(.orange, style: StrokeStyle(lineWidth: ringSize / 9, lineCap: .round))
          .rotationEffect(.degrees(-90))
        Text(added, format: .number)
          .font(.title3.bold())
          .monospacedDigit()
      }
      .frame(width: ringSize, height: ringSize)
      VStack(alignment: .leading, spacing: 2) {
        Text("Today")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)
          .textCase(.uppercase)
        Text(ProgressWording.ofGoal(added, todaysGoal))
          .font(.title3.bold())
        if met {
          Label("Goal met", systemImage: "checkmark.circle.fill")
            .foregroundStyle(.green)
        } else {
          Text("\(todaysGoal - added) more to reach today’s goal")
            .foregroundStyle(.secondary)
        }
      }
    }
  }

  private var spoken: String {
    var parts = ["Today", ProgressWording.ofGoal(added, todaysGoal)]
    if met { parts.append("goal met") }
    if streak > 0 { parts.append(ProgressWording.streak(streak)) }
    return parts.joined(separator: ", ")
  }
}

private struct ProgressWeekStrip: View {
  let stats: ProgressStats?

  var body: some View {
    HStack(spacing: 4) {
      ForEach(ProgressWeek.days(endingWith: stats)) { day in
        VStack(spacing: 6) {
          Text(day.letter)
            .font(.caption.weight(day.isToday ? .bold : .semibold))
            .foregroundStyle(.secondary)
          Image(systemName: day.met ? "checkmark.circle.fill" : "circle")
            .font(.title2)
            .foregroundStyle(day.met || day.isToday ? AnyShapeStyle(.orange) : AnyShapeStyle(.tertiary))
        }
        .frame(maxWidth: .infinity)
      }
    }
  }
}

struct ProgressWeek {
  struct Day: Identifiable, Equatable {
    let id: String
    let letter: String
    let met: Bool
    let isToday: Bool
  }

  static func days(endingWith stats: ProgressStats?, calendar: Calendar = .autoupdatingCurrent) -> [Day] {
    var gregorian = Calendar(identifier: .gregorian)
    gregorian.timeZone = calendar.timeZone
    let todayName = stats?.today.day
    let today = todayName.flatMap { date(of: $0, in: gregorian) } ?? gregorian.startOfDay(for: .now)
    let met = Set(stats?.last7.filter(\.met).map(\.day) ?? [])
    return (0..<7).reversed().compactMap { back in
      guard let day = gregorian.date(byAdding: .day, value: -back, to: today) else { return nil }
      let name = ProgressLog.day(of: day, in: gregorian)
      return Day(
        id: name, letter: day.formatted(.dateTime.weekday(.narrow)), met: met.contains(name),
        isToday: back == 0)
    }
  }

  static func date(of name: String, in calendar: Calendar) -> Date? {
    let parts = name.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
  }
}
