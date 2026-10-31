import Charts
import SwiftUI

enum ProgressSpan: String, CaseIterable, Identifiable {
  case week = "Week"
  case month = "Month"

  var id: Self { self }
}

struct ProgressNewWordsCard: View {
  @ScaledMetric private var chartHeight = 180.0
  @State private var span = ProgressSpan.week
  @State private var touched: String?
  @State private var selected: String?
  let stats: ProgressStats?

  private var days: [ProgressStats.Day] {
    (span == .week ? stats?.last7 : stats?.last30) ?? []
  }

  private var shown: ProgressStats.Day? {
    days.first { $0.day == selected } ?? stats?.today
  }

  private var goalMet: ProgressStats.GoalMet? {
    span == .week ? stats?.goalMet.last7 : stats?.goalMet.last30
  }

  private var added: Int {
    (span == .week ? stats?.totals.addedLast7 : stats?.totals.addedLast30) ?? 0
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      StackedWhenLarge(spacing: 8) {
        Text("New words per day")
          .font(.headline)
        Spacer(minLength: 0)
        Picker("Days shown", selection: $span) {
          ForEach(ProgressSpan.allCases) { Text($0.rawValue).tag($0) }
        }
        .pickerStyle(.segmented)
        .fixedSize()
        .accessibilityIdentifier("progress.span")
      }
      Text(shown.map { ProgressWording.dayLine($0) } ?? "")
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .accessibilityIdentifier("progress.new-words.day")
      chart
      if span == .month, let first = days.first {
        StackedWhenLarge(spacing: 2) {
          Text(ProgressWording.shortDate(first.day))
          Spacer(minLength: 0)
          Text("Today")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
      }
      if let goalMet {
        Text(ProgressWording.goalMetDays(goalMet, words: added))
          .font(.footnote)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("progress.new-words.footer")
      }
    }
    .padding(.vertical, 6)
    .redacted(reason: stats == nil ? .placeholder : [])
    .onChange(of: touched) {
      if let touched { selected = touched }
    }
    .onChange(of: span) {
      if !days.contains(where: { $0.day == selected }) { selected = nil }
    }
  }

  private var chart: some View {
    Chart {
      ForEach(days, id: \.day) { day in
        BarMark(x: .value("Day", day.day), y: .value("Words", day.added))
          .foregroundStyle(.orange)
          .opacity(selected == nil || selected == day.day ? 1 : 0.4)
          .accessibilityLabel(ProgressWording.dayLine(day))
          .accessibilityIdentifier("progress.new-words.bar.\(day.day)")
      }
      ForEach(days, id: \.day) { day in
        LineMark(x: .value("Day", day.day), y: .value("Goal", day.goal))
          .interpolationMethod(.stepCenter)
          .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
          .foregroundStyle(Color.secondary)
          .accessibilityHidden(true)
      }
      if let goal = stats?.today.goal {
        RuleMark(y: .value("Goal", goal))
          .foregroundStyle(.clear)
          .annotation(position: .top, alignment: .trailing) {
            Text("goal \(goal)")
              .font(.caption2)
              .foregroundStyle(.secondary)
          }
          .accessibilityLabel("Goal")
          .accessibilityValue(ProgressWording.newWords(goal))
      }
    }
    .tappableDays(touched: $touched)
    .chartXAxis(span == .week ? .visible : .hidden)
    .frame(height: min(chartHeight, 320))
    .accessibilityIdentifier("progress.new-words.chart")
  }
}

extension View {
  func tappableDays(touched: Binding<String?>) -> some View {
    chartXSelection(value: touched)
      .chartGesture { proxy in
        SpatialTapGesture().onEnded { proxy.selectXValue(at: $0.location.x) }
      }
      .chartYAxis(.hidden)
      .chartXAxis {
        AxisMarks { value in
          AxisValueLabel {
            Text(value.as(String.self).map { ProgressWeek.letter(of: $0) } ?? "")
          }
        }
      }
  }
}
