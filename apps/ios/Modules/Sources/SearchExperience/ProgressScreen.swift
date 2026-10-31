import SwiftUI

struct ProgressScreen: View {
  @AppStorage(DailyGoal.key) private var storedGoal = Double(DailyGoal.standard)
  @State private var stats: ProgressStats?
  @State private var coverage: JLPTCoverageModel?

  private var goal: Int { DailyGoal.clamped(storedGoal) }

  var body: some View {
    List {
      Section {
        ProgressTodaySummary(stats: stats, goal: goal)
      }
      Section {
        ProgressTiles(stats: stats)
          .listRowBackground(Color.clear)
          .listRowInsets(EdgeInsets())
      }
      Section {
        ProgressNewWordsCard(stats: stats)
      }
      Section {
        ProgressJLPTCoverageCard(coverage: coverage?.coverage)
      }
      Section {
        ProgressKnownOverTimeCard(stats: stats)
      }
    }
    .groupedList()
    .readsProgressStats(into: $stats)
    .followsJLPTCoverage(goal: goal, into: $coverage)
    .navigationTitle("Progress")
    .accessibilityIdentifier("progress.list")
  }
}

private struct ProgressTodaySummary: View, ShowsTodaysProgress {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @ScaledMetric(relativeTo: .largeTitle) private var ringSize = 150.0
  let stats: ProgressStats?
  let goal: Int

  var body: some View {
    VStack(spacing: 16) {
      GoalRing(added: added, goal: todaysGoal, diameter: min(ringSize, 240)) {
        VStack(spacing: 0) {
          Text(added, format: .number)
            .font(.system(.largeTitle, design: .rounded, weight: .bold))
            .monospacedDigit()
          if !dynamicTypeSize.isAccessibilitySize {
            ofToday
          }
        }
      }
      if dynamicTypeSize.isAccessibilitySize {
        ofToday
      }
      StackedWhenLarge(spacing: 8, across: 8, alignment: .center) {
        if met {
          ProgressCapsule(ProgressWording.goalMet, systemImage: "checkmark.circle.fill", tint: .green)
        } else {
          ProgressCapsule(
            ProgressWording.moreToGo(todaysGoal - added), systemImage: "target", tint: .orange)
        }
        if streak > 0 {
          ProgressCapsule(
            ProgressWording.streak(streak), systemImage: "flame.fill", tint: .orange,
            background: AnyShapeStyle(.fill.tertiary))
        }
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 12)
    .redacted(reason: stats == nil ? .placeholder : [])
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(spokenToday(sayingWhatsLeft: true))
    .accessibilityIdentifier("progress.today")
  }

  private var ofToday: some View {
    Text(ProgressWording.ofToday(todaysGoal))
      .font(.subheadline)
      .foregroundStyle(.secondary)
      .multilineTextAlignment(.center)
  }
}

private struct ProgressCapsule: View {
  let title: String
  let systemImage: String
  let tint: Color
  let background: AnyShapeStyle

  init(_ title: String, systemImage: String, tint: Color, background: AnyShapeStyle? = nil) {
    self.title = title
    self.systemImage = systemImage
    self.tint = tint
    self.background = background ?? AnyShapeStyle(tint.opacity(0.15))
  }

  var body: some View {
    Label {
      Text(title)
    } icon: {
      Image(systemName: systemImage).foregroundStyle(tint)
    }
    .font(.subheadline.weight(.semibold))
    .padding(.horizontal, 12)
    .padding(.vertical, 6)
    .background(background, in: .capsule)
  }
}

private struct ProgressTiles: View {
  let stats: ProgressStats?

  var body: some View {
    VStack(spacing: 12) {
      StackedWhenLarge(spacing: 12, across: 12) {
        known
        learning
      }
      .fixedSize(horizontal: false, vertical: true)
      StackedWhenLarge(spacing: 12, across: 12) {
        bestStreak
        dailyAverage
      }
      .fixedSize(horizontal: false, vertical: true)
    }
    .redacted(reason: stats == nil ? .placeholder : [])
  }

  private var known: some View {
    ProgressTile(
      "Known", tint: .teal, value: (stats?.totals.known ?? 0).formatted(),
      detail: ProgressWording.inLastWeek(stats?.totals.markedKnownLast7 ?? 0), identifier: "known")
  }

  private var learning: some View {
    ProgressTile(
      "Learning", tint: .orange, value: (stats?.totals.learning ?? 0).formatted(),
      detail: ProgressWording.inLastWeek(stats?.totals.addedLast7 ?? 0), identifier: "learning")
  }

  private var bestStreak: some View {
    let best = stats?.bestStreak
    return ProgressTile(
      "Best streak", tint: .pink, value: best.map { ProgressWording.days($0.length) } ?? "—",
      detail: best.map { ProgressWording.streakDays($0) } ?? "No streak yet",
      identifier: "best-streak")
  }

  private var dailyAverage: some View {
    let average = stats?.dailyAverage
    let averaged = average.flatMap { $0.days > 0 ? $0 : nil }
    return ProgressTile(
      "Daily average", tint: .gray, value: averaged.map { ProgressWording.average($0.average) } ?? "—",
      detail: averaged.map { ProgressWording.lastDays($0.days) } ?? "No days yet",
      identifier: "daily-average")
  }
}

private struct ProgressTile: View {
  let title: String
  let tint: Color
  let value: String
  let detail: String
  let identifier: String

  init(_ title: String, tint: Color, value: String, detail: String, identifier: String) {
    self.title = title
    self.tint = tint
    self.value = value
    self.detail = detail
    self.identifier = identifier
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      ProgressDotLabel(title, tint: tint)
        .font(.subheadline.weight(.semibold))
      Text(value)
        .font(.title.bold())
        .monospacedDigit()
      Text(detail)
        .font(.footnote)
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(16)
    .background(SystemColor.groupedRow, in: .rect(cornerRadius: 24))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(title)
    .accessibilityValue("\(value), \(detail)")
    .accessibilityIdentifier("progress.\(identifier)")
  }
}

struct ProgressDotLabel: View {
  @ScaledMetric(relativeTo: .footnote) private var dot = 8.0
  let title: String
  let tint: Color

  init(_ title: String, tint: Color) {
    self.title = title
    self.tint = tint
  }

  var body: some View {
    HStack(spacing: 6) {
      Circle()
        .fill(tint)
        .frame(width: dot, height: dot)
      Text(title)
    }
  }
}
