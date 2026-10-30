import Charts
import SwiftUI

struct KnownByDateView: View {
  @Environment(ProgressLog.self) private var progressLog
  @Environment(WordKnowledge.self) private var wordKnowledge
  @State private var week = 0
  @State private var shown: KnownByDate?
  @State private var resolved: KnownByDateRows?
  let lookupClient: LookupClient
  let openWord: (WordKnowledgeRecord) -> Void

  private var markedDays: [KnownByDate.Day] { shown?.markedDays ?? [] }

  private var rows: KnowledgeRows? { resolved?.rows(for: shown) }

  var body: some View {
    List {
      Section {
        KnownByDateWeek(shown: shown, today: progressLog.today, week: $week)
      } footer: {
        if markedDays.isEmpty { footer }
      }
      if rows == nil, !markedDays.isEmpty {
        Section {
          ProgressView()
            .frame(maxWidth: .infinity)
            .accessibilityIdentifier("known-by-date.loading")
        }
      } else {
        ForEach(markedDays) { day in
          daySection(day)
        }
      }
    }
    .groupedList()
    .task(id: Asked(days: progressLog.days, today: progressLog.today, week: week)) {
      shown = await progressLog.knownByDate(week: week)
    }
    .task(id: rowsRequest) {
      guard wordKnowledge.isLoaded, !rowsRequest.records.isEmpty, let week = shown?.week else { return }
      guard let rows = await wordKnowledge.rows(for: rowsRequest.records, using: lookupClient) else { return }
      resolved = KnownByDateRows(week: week, rows: rows)
    }
    .navigationTitle("Known Words by Date")
    .accessibilityIdentifier("known-by-date.list")
  }

  private func daySection(_ day: KnownByDate.Day) -> some View {
    Section {
      ForEach(day.records(in: wordKnowledge.records)) { record in
        KnowledgeRow(record: record, rows: rows ?? .none, lookupClient: lookupClient) {
          open(record)
        }
      }
    } header: {
      HStack(alignment: .firstTextBaseline) {
        Text(ProgressWording.knownDaySection(day.day, today: progressLog.today))
        Spacer(minLength: 8)
        Text(ProgressWording.words(day.count))
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }
      .accessibilityElement(children: .combine)
      .accessibilityIdentifier("known-by-date.day.\(day.day)")
    } footer: {
      if day.id == markedDays.last?.id { footer }
    }
    .headerProminence(.increased)
  }

  @ViewBuilder private var footer: some View {
    if let first = shown?.firstDay {
      Text(ProgressWording.datesStart(first))
        .accessibilityIdentifier("known-by-date.footer")
    }
  }

  private func open(_ record: WordKnowledgeRecord) {
    guard record.headword.isEmpty, let entry = rows?.word(for: record)?.entry else {
      return openWord(record)
    }
    openWord(
      WordKnowledgeRecord(
        entryID: record.entryID, headword: entry.headword, reading: entry.reading,
        status: record.status, updatedAt: record.updatedAt))
  }

  private var rowsRequest: RowsRequest {
    RowsRequest(
      isLoaded: wordKnowledge.isLoaded,
      records: (shown?.days ?? []).flatMap { $0.records(in: wordKnowledge.records) },
      lists: FrequencyLists.live.version)
  }

  private struct Asked: Equatable {
    let days: [String: ProgressLogDay]
    let today: String
    let week: Int
  }

  private struct RowsRequest: Equatable {
    let isLoaded: Bool
    let records: [WordKnowledgeRecord]
    let lists: Int
  }
}

private struct KnownByDateWeek: View {
  @ScaledMetric private var chartHeight = 160.0
  @State private var touched: String?
  @State private var selected: String?
  let shown: KnownByDate?
  let today: String
  @Binding var week: Int

  private var days: [KnownByDate.Day] { shown?.days ?? [] }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text(ProgressWording.knownWeek(days, today: today))
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)
          .textCase(.uppercase)
          .accessibilityIdentifier("known-by-date.week")
        Spacer(minLength: 8)
        HStack(spacing: 0) {
          step("Earlier week", "chevron.left", by: 1)
            .accessibilityIdentifier("known-by-date.earlier")
          step("Later week", "chevron.right", by: -1)
            .accessibilityIdentifier("known-by-date.later")
        }
        .padding(.vertical, -10)
        .padding(.trailing, -12)
      }
      Text(ProgressWording.markedKnown(shown?.total ?? 0))
        .font(.title2.bold())
        .accessibilityIdentifier("known-by-date.total")
      if let change = shown?.change {
        Text(ProgressWording.versusWeekBefore(change))
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("known-by-date.change")
      }
      Text((days.first { $0.day == selected } ?? days.last).map { ProgressWording.knownDayLine($0) } ?? "")
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .accessibilityIdentifier("known-by-date.day")
      chart
        .padding(.top, 6)
    }
    .padding(.vertical, 6)
    .redacted(reason: shown == nil ? .placeholder : [])
    .onChange(of: touched) {
      if let touched { selected = touched }
    }
    .onChange(of: shown?.week) { selected = nil }
  }

  private func step(_ title: String, _ symbol: String, by change: Int) -> some View {
    Button {
      if let shown { week = shown.stepped(by: change) }
    } label: {
      Label(title, systemImage: symbol)
        .labelStyle(.iconOnly)
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(.rect)
    }
    .buttonStyle(.borderless)
    .disabled(shown.map { $0.stepped(by: change) == $0.week } ?? true)
  }

  private var chart: some View {
    Chart(days) { day in
      BarMark(x: .value("Day", day.day), y: .value("Known", day.count))
        .foregroundStyle(.teal)
        .opacity(selected == nil || selected == day.day ? 1 : 0.4)
        .accessibilityLabel(ProgressWording.knownDayLine(day))
        .accessibilityIdentifier("known-by-date.bar.\(day.day)")
    }
    .tappableDays(touched: $touched)
    .frame(height: min(chartHeight, 280))
    .accessibilityIdentifier("known-by-date.chart")
  }
}
