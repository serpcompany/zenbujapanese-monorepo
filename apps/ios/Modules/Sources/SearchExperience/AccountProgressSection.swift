import SwiftUI

struct AccountProgressSection: View {
  @Environment(ProgressLog.self) private var progressLog
  @AppStorage(DailyGoal.key) private var storedGoal = Double(DailyGoal.standard)
  @State private var stats: ProgressStats?
  @State private var choosesGoal = false

  private var goal: Int { DailyGoal.clamped(storedGoal) }

  var body: some View {
    Section {
      TodayProgressCard(stats: stats, goal: goal)
        .task(id: StatsAsked(days: progressLog.days, goal: goal, today: progressLog.day(of: .now))) {
          stats = await progressLog.stats()
        }
      Button {
        choosesGoal = true
      } label: {
        LabeledContent {
          HStack {
            Text(ProgressWording.newWords(goal))
            Image(systemName: "chevron.forward")
              .font(.footnote.weight(.semibold))
              .foregroundStyle(.tertiary)
              .accessibilityHidden(true)
          }
        } label: {
          SettingsRowLabel("Daily Goal", systemImage: "target", tint: .green)
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
}

struct TodayProgressCard: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
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
      Gauge(value: Double(min(added, todaysGoal)), in: 0...Double(todaysGoal)) {
        Text("Today")
      } currentValueLabel: {
        Text(added, format: .number)
      }
      .gaugeStyle(.accessoryCircularCapacity)
      .tint(.orange)
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
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  let stats: ProgressStats?

  var body: some View {
    let columns = Array(
      repeating: GridItem(.flexible(), spacing: 4), count: dynamicTypeSize.isAccessibilitySize ? 4 : 7)
    LazyVGrid(columns: columns, spacing: 10) {
      ForEach(ProgressWeek.days(endingWith: stats)) { day in
        VStack(spacing: 6) {
          Text(day.letter)
            .font(.caption.weight(day.isToday ? .bold : .semibold))
            .foregroundStyle(.secondary)
          Image(systemName: day.met ? "checkmark.circle.fill" : "circle")
            .font(.title2)
            .foregroundStyle(day.met || day.isToday ? AnyShapeStyle(.orange) : AnyShapeStyle(.tertiary))
        }
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

  private static func date(of name: String, in calendar: Calendar) -> Date? {
    let parts = name.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
  }
}
