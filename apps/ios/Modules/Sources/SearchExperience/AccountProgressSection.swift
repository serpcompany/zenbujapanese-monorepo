import SwiftUI

struct AccountProgressSection: View {
  @AppStorage(DailyGoal.key) private var storedGoal = Double(DailyGoal.standard)
  @State private var stats: ProgressStats?
  @State private var choosesGoal = false

  private var goal: Int { DailyGoal.clamped(storedGoal) }

  var body: some View {
    Section {
      TodayProgressCard(stats: stats, goal: goal)
        .readsProgressStats(into: $stats)
      NavigationLink(value: AccountRoute.progress) {
        SettingsRowLabel("Progress", systemImage: "chart.line.uptrend.xyaxis", tint: .pink)
      }
      .accessibilityIdentifier("account.progress")
      Button {
        choosesGoal = true
      } label: {
        HStack {
          StackedWhenLarge(spacing: 4) {
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
}

private struct ProgressStatsReader: ViewModifier {
  @Environment(ProgressLog.self) private var progressLog
  @AppStorage(DailyGoal.key) private var storedGoal = Double(DailyGoal.standard)
  @Binding var stats: ProgressStats?

  func body(content: Content) -> some View {
    content.task(
      id: Asked(days: progressLog.days, goal: DailyGoal.clamped(storedGoal), today: progressLog.today)
    ) {
      stats = await progressLog.stats()
    }
  }

  private struct Asked: Equatable {
    let days: [String: ProgressLogDay]
    let goal: Int
    let today: String
  }
}

extension View {
  func readsProgressStats(into stats: Binding<ProgressStats?>) -> some View {
    modifier(ProgressStatsReader(stats: stats))
  }
}

struct StackedWhenLarge<Content: View>: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  let spacing: CGFloat
  var across: CGFloat?
  var alignment = HorizontalAlignment.leading
  @ViewBuilder let content: () -> Content

  var body: some View {
    let layout =
      dynamicTypeSize.isAccessibilitySize
      ? AnyLayout(VStackLayout(alignment: alignment, spacing: spacing))
      : AnyLayout(HStackLayout(spacing: across))
    layout(content)
  }
}

struct GoalRing<Center: View>: View {
  let added: Int
  let goal: Int
  let diameter: Double
  @ViewBuilder let center: () -> Center

  var body: some View {
    ZStack {
      Circle()
        .stroke(.orange.opacity(0.2), lineWidth: diameter / 9)
      Circle()
        .trim(from: 0, to: goal > 0 ? min(Double(added) / Double(goal), 1) : 0)
        .stroke(.orange, style: StrokeStyle(lineWidth: diameter / 9, lineCap: .round))
        .rotationEffect(.degrees(-90))
      center()
    }
    .frame(width: diameter, height: diameter)
  }
}

protocol ShowsTodaysProgress {
  var stats: ProgressStats? { get }
  var goal: Int { get }
}

extension ShowsTodaysProgress {
  var added: Int { stats?.today.added ?? 0 }
  var todaysGoal: Int { stats?.today.goal ?? goal }
  var met: Bool { stats?.today.met ?? false }
  var streak: Int { stats?.streak ?? 0 }
}

struct TodayProgressCard: View, ShowsTodaysProgress {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Environment(\.openAccountRoute) private var openAccountRoute
  @ScaledMetric(relativeTo: .title3) private var ringSize = 58.0
  let stats: ProgressStats?
  let goal: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      summary
      ProgressWeekStrip(stats: stats)
      StackedWhenLarge(spacing: 8) {
        if streak > 0 {
          Label {
            Text(ProgressWording.streak(streak)).fontWeight(.semibold)
          } icon: {
            Image(systemName: "flame.fill").foregroundStyle(.orange)
          }
        }
        Spacer(minLength: 0)
        Text(Self.seeProgress).hidden()
      }
    }
    .fixedSize(horizontal: false, vertical: true)
    .padding(.vertical, 6)
    .redacted(reason: stats == nil ? .placeholder : [])
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(spoken)
    .accessibilityIdentifier("account.progress.today")
    .overlay(alignment: dynamicTypeSize.isAccessibilitySize ? .bottomLeading : .bottomTrailing) {
      Button(Self.seeProgress) { openAccountRoute(.progress) }
        .buttonStyle(.borderless)
        .padding(.bottom, 6)
        .accessibilityIdentifier("account.progress.see")
    }
  }

  private static let seeProgress = "See progress"

  private var summary: some View {
    StackedWhenLarge(spacing: 12, across: 16) {
      GoalRing(added: added, goal: todaysGoal, diameter: ringSize) {
        Text(added, format: .number)
          .font(.title3.bold())
          .monospacedDigit()
      }
      VStack(alignment: .leading, spacing: 2) {
        Text("Today")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)
          .textCase(.uppercase)
        Text(ProgressWording.ofGoal(added, todaysGoal))
          .font(.title3.bold())
        if met {
          Label(ProgressWording.goalMet, systemImage: "checkmark.circle.fill")
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
  @ScaledMetric(relativeTo: .title2) private var circleSize = 28.0
  let stats: ProgressStats?

  var body: some View {
    HStack(spacing: 4) {
      ForEach(ProgressWeek.days(endingWith: stats)) { day in
        VStack(spacing: 6) {
          Text(day.letter)
            .font(.caption.weight(day.isToday ? .bold : .semibold))
            .foregroundStyle(.secondary)
          Image(systemName: day.met ? "checkmark.circle.fill" : "circle")
            .resizable()
            .scaledToFit()
            .frame(maxWidth: circleSize)
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
    let gregorian = gregorian(in: calendar.timeZone)
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

  static func gregorian(in timeZone: TimeZone = .autoupdatingCurrent) -> Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    return calendar
  }

  static func date(of name: String, in calendar: Calendar) -> Date? {
    let parts = name.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
  }
}
