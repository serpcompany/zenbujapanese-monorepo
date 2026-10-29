import Charts
import SwiftUI

private enum ProgressBand {
  static let known = "Known"
  static let learning = "Learning"
  static let knownTint = Color.teal
  static let learningTint = Color.orange
}

struct ProgressJLPTCoverageCard: View {
  let coverage: JLPTCoverage?

  private var levels: [JLPTCoverage.Level] {
    (coverage?.levels ?? []).sorted { $0.level > $1.level }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("JLPT coverage")
        .font(.headline)
      if coverage == nil {
        ProgressView()
          .frame(maxWidth: .infinity)
      }
      ForEach(levels) { level in
        ProgressLevelBar(level: level)
      }
      StackedWhenLarge(spacing: 4, across: 16) {
        ProgressDotLabel(ProgressBand.known, tint: ProgressBand.knownTint)
        ProgressDotLabel(ProgressBand.learning, tint: ProgressBand.learningTint)
      }
      .font(.footnote)
      .accessibilityElement(children: .combine)
    }
    .padding(.vertical, 6)
  }
}

private struct ProgressLevelBar: View {
  @ScaledMetric(relativeTo: .body) private var barHeight = 10.0
  let level: JLPTCoverage.Level

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      StackedWhenLarge(spacing: 2) {
        Text(level.name)
          .font(.headline)
        Spacer(minLength: 0)
        Text(ProgressWording.levelCounts(level))
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }
      Chart {
        BarMark(x: .value("Words", level.known), y: .value("Level", level.name), height: .ratio(1))
          .foregroundStyle(by: .value("Band", ProgressBand.known))
        BarMark(x: .value("Words", level.learning), y: .value("Level", level.name), height: .ratio(1))
          .foregroundStyle(by: .value("Band", ProgressBand.learning))
      }
      .chartForegroundStyleScale([
        ProgressBand.known: ProgressBand.knownTint, ProgressBand.learning: ProgressBand.learningTint,
      ])
      .chartXScale(domain: 0...max(level.words, 1))
      .chartXAxis(.hidden)
      .chartYAxis(.hidden)
      .chartLegend(.hidden)
      .chartPlotStyle { $0.background(.fill.tertiary) }
      .frame(height: barHeight)
      .clipShape(.capsule)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(level.name)
    .accessibilityValue(
      "\(ProgressWording.levelCounts(level)), \(level.learning.formatted()) \(ProgressBand.learning)")
    .accessibilityIdentifier("progress.jlpt.n\(level.level)")
  }
}

struct ProgressKnownOverTimeCard: View {
  @Environment(\.openAccountRoute) private var openAccountRoute
  @ScaledMetric private var chartHeight = 120.0
  let stats: ProgressStats?

  private struct Point: Identifiable {
    let known: ProgressStats.KnownOnDay
    let date: Date

    var id: String { known.day }
  }

  private var points: [Point] {
    let calendar = ProgressWeek.gregorian()
    return (stats?.knownOverTime ?? []).compactMap { known in
      ProgressWeek.date(of: known.day, in: calendar).map { Point(known: known, date: $0) }
    }
  }

  var body: some View {
    let points = points
    VStack(alignment: .leading, spacing: 12) {
      StackedWhenLarge(spacing: 2) {
        Text("Known over time")
          .font(.headline)
          .fixedSize(horizontal: false, vertical: true)
        Spacer(minLength: 0)
        Text(ProgressWording.inLastWeek(stats?.totals.markedKnownLast7 ?? 0))
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.secondary)
      }
      if let first = points.first?.known, let last = points.last?.known, points.count > 1 {
        Chart(points) { point in
          AreaMark(x: .value("Day", point.date, unit: .day), y: .value("Known", point.known.known))
            .foregroundStyle(ProgressBand.knownTint.opacity(0.2))
          LineMark(x: .value("Day", point.date, unit: .day), y: .value("Known", point.known.known))
            .foregroundStyle(ProgressBand.knownTint)
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .frame(height: min(chartHeight, 240))
        .accessibilityIdentifier("progress.known-over-time.chart")
        StackedWhenLarge(spacing: 2) {
          Text(ProgressWording.knownOnDay(first, isToday: false))
          Spacer(minLength: 0)
          Text(ProgressWording.knownOnDay(last, isToday: true))
        }
        .font(.caption)
        .foregroundStyle(.secondary)
      } else {
        Text("Your Known words show here as the days go by.")
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("progress.known-over-time.empty")
      }
      Button("Known words by date") { openAccountRoute(.knownByDate) }
        .buttonStyle(.borderless)
        .accessibilityIdentifier("progress.known-by-date")
    }
    .padding(.vertical, 6)
    .redacted(reason: stats == nil ? .placeholder : [])
  }
}
