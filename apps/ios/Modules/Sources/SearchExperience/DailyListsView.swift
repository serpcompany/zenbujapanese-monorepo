import SwiftUI

struct DailyListsRow: View {
  let count: Int

  var body: some View {
    NavigationLink(value: AccountRoute.dailyLists) {
      LabeledContent {
        Text(count, format: .number)
      } label: {
        Label("Daily Lists", systemImage: "calendar")
      }
    }
    .accessibilityIdentifier("word-lists.daily-lists")
  }
}

struct DailyListsView: View {
  @Environment(WordLists.self) private var wordLists
  @Environment(WordKnowledge.self) private var wordKnowledge
  @Environment(ProgressLog.self) private var progressLog
  @State private var metDays: Set<String> = []

  var body: some View {
    let asked = ProgressStatsRequest(
      days: progressLog.days, goal: progressLog.goal, today: progressLog.today)
    content
      .navigationTitle("Daily Lists")
      .task(id: asked) {
        let stats = await ProgressLog.answer(asked, using: .shared)
        metDays = Set(stats?.days.filter(\.met).map(\.day) ?? [])
      }
  }

  @ViewBuilder
  private var content: some View {
    let today = progressLog.today
    let groups = DailyListDays.groups(wordLists.dailyLists, today: today)
    if !wordLists.isLoaded {
      ProgressView("Loading Lists")
        .accessibilityIdentifier("daily-lists.loading")
    } else if groups.isEmpty {
      ContentUnavailableView(
        "No Daily Lists", systemImage: "calendar",
        description: Text("Each day’s new Learning words go in a list of their own."))
        .accessibilityIdentifier("daily-lists.empty")
    } else {
      List {
        ForEach(groups) { group in
          Section(group.heading) {
            ForEach(group.lists) { daily in
              row(daily, today: today)
            }
          }
        }
      }
      .accessibilityIdentifier("daily-lists.list")
    }
  }

  private func row(_ daily: DailyList, today: String) -> some View {
    let words = wordLists.words(in: daily.id)
    let known = words.count { wordKnowledge.status(storedID: $0.entryID) == .known }
    let isToday = daily.day == today
    return NavigationLink(value: AccountRoute.wordList(daily.id)) {
      DailyListRow(
        title: DailyListDays.title(of: daily.day, today: today),
        line: DailyListWording.line(
          words: words.count, isToday: isToday, met: metDays.contains(daily.day), known: known),
        known: known, count: words.count, isToday: isToday)
    }
    .accessibilityIdentifier("daily-lists.list.\(daily.day)")
  }
}

private struct DailyListRow: View {
  @ScaledMetric(relativeTo: .body) private var barWidth = 56.0
  let title: String
  let line: String
  let known: Int
  let count: Int
  let isToday: Bool

  var body: some View {
    StackedWhenLarge(spacing: 8, across: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
          .fontWeight(isToday ? .semibold : .regular)
        Text(line)
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      ProgressView(value: Double(known), total: Double(max(count, 1)))
        .tint(.green)
        .frame(width: barWidth)
        .accessibilityHidden(true)
    }
    .accessibilityElement(children: .combine)
  }
}

enum DailyListWording {
  static func line(words: Int, isToday: Bool, met: Bool, known: Int) -> String {
    let counted =
      isToday
      ? AttributedString(localized: "^[\(words) word](inflect: true) so far")
      : AttributedString(localized: "^[\(words) word](inflect: true)")
    var parts = [String(counted.characters)]
    if met { parts.append(String(localized: "goal met")) }
    if known > 0 { parts.append(String(localized: "\(known) now Known")) }
    return parts.joined(separator: " · ")
  }
}
