import Charts
import SwiftUI

struct JLPTProgressScreen: View {
  static let upNext = 10
  static let shown = 5

  @AppStorage(DailyGoal.key) private var storedGoal = Double(DailyGoal.standard)
  @State private var model: JLPTCoverageModel?
  @State private var chosen: Int?
  let lookupClient: LookupClient
  let openWord: (DictionaryEntry) -> Void

  private var goal: Int { DailyGoal.clamped(storedGoal) }

  var body: some View {
    let coverage = model?.coverage
    let number = chosen ?? coverage?.startingLevel ?? 5
    List {
      Section {
        Picker("Level", selection: Binding(get: { number }, set: { chosen = $0 })) {
          ForEach([5, 4, 3, 2, 1], id: \.self) { level in
            Text("N\(level)").tag(level)
          }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .accessibilityIdentifier("jlpt-progress.level")
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets())
      }
      if let level = coverage?.level(number) {
        Section {
          JLPTLevelRing(level: level)
        }
        Section {
          Text(ProgressWording.pace(level, goal: goal))
            .accessibilityIdentifier("jlpt-progress.pace")
        } footer: {
          if level.pace != nil {
            Text("Turning them Known depends on review, so this shows the start, not the finish.")
          }
        }
        if level.pace != nil {
          JLPTUpNext(level: level, lookupClient: lookupClient, openWord: openWord)
        }
      } else {
        ProgressView()
          .frame(maxWidth: .infinity)
      }
      Section {
        ForEach((coverage?.levels ?? []).sorted { $0.level > $1.level }) { level in
          ProgressLevelBar(
            level: level, identifier: "jlpt-progress.bar", isChosen: level.level == number
          ) {
            chosen = level.level
          }
        }
      }
    }
    .groupedList()
    .followsJLPTCoverage(goal: goal, upNext: Self.upNext, into: $model)
    .navigationTitle("JLPT Progress")
    .accessibilityIdentifier("jlpt-progress.list")
  }
}

private struct JLPTLevelRing: View {
  @ScaledMetric(relativeTo: .largeTitle) private var ringSize = 180.0
  let level: JLPTCoverage.Level

  private struct Band: Identifiable {
    let name: String
    let count: Int
    let tint: Color

    var id: String { name }
  }

  private var bands: [Band] {
    [
      Band(name: ProgressBand.known, count: level.known, tint: ProgressBand.knownTint),
      Band(name: ProgressBand.learning, count: level.learning, tint: ProgressBand.learningTint),
      Band(name: Self.notStarted, count: level.notStarted, tint: SystemColor.tertiaryFill),
    ]
  }

  private static let notStarted = "Not started"

  var body: some View {
    VStack(spacing: 16) {
      Chart(bands) { band in
        SectorMark(angle: .value("Words", band.count), innerRadius: .ratio(0.74), angularInset: 1)
          .foregroundStyle(band.tint)
      }
      .chartLegend(.hidden)
      .frame(width: min(ringSize, 280), height: min(ringSize, 280))
      .overlay {
        VStack(spacing: 0) {
          Text(ProgressWording.percent(level))
            .font(.system(.largeTitle, design: .rounded, weight: .bold))
            .monospacedDigit()
          Text("of \(level.name) known")
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .minimumScaleFactor(0.5)
        .padding(ringSize * 0.18)
      }
      StackedWhenLarge(spacing: 8, across: 8) {
        ForEach(bands) { band in
          VStack(spacing: 2) {
            Text(band.count, format: .number)
              .font(.title2.bold())
              .monospacedDigit()
            ProgressDotLabel(band.name, tint: band.tint)
              .font(.footnote)
          }
          .frame(maxWidth: .infinity)
        }
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 12)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(ProgressWording.percent(level)) of \(level.name) known")
    .accessibilityValue(bands.map { "\($0.count.formatted()) \($0.name)" }.joined(separator: ", "))
    .accessibilityIdentifier("jlpt-progress.ring")
  }
}

private struct JLPTUpNext: View {
  @Environment(WordKnowledge.self) private var knowledge
  @State private var rows: KnowledgeRows?
  @State private var entries: [DictionaryEntry] = []
  @State private var resolved: [String] = []
  let level: JLPTCoverage.Level
  let lookupClient: LookupClient
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    let words = level.upNext.prefix(JLPTProgressScreen.shown).compactMap { rows?.words[$0] }
    Section {
      if words.isEmpty {
        ProgressView()
          .frame(maxWidth: .infinity)
      }
      ForEach(words, id: \.entry.id) { word in
        ResultRow(entry: word.entry, row: word.row) { openWord(word.entry) }
      }
      Button(action: add) {
        Text(ProgressWording.addToLearning(level.upNext.count, level: level.name))
          .frame(maxWidth: .infinity)
      }
      .buttonStyle(.borderedProminent)
      .controlSize(.large)
      .disabled(!knowledge.canChange || resolved != level.upNext)
      .accessibilityIdentifier("jlpt-progress.add")
    } header: {
      Text("Up next in \(level.name)")
    }
    .task(id: level.upNext) {
      let ids = level.upNext
      let found = (try? await lookupClient.entries(ids.map(LanguageReferenceID.init(rawValue:)))) ?? [:]
      let shown = Array(ids.prefix(JLPTProgressScreen.shown))
      guard let listed = await KnowledgeRows.resolving(ids: shown, known: [], using: lookupClient)
      else { return }
      rows = listed
      entries = ids.compactMap { id in found[LanguageReferenceID(rawValue: id)] }
      resolved = ids
    }
  }

  private func add() {
    for entry in entries {
      knowledge.setStatus(.learning, for: entry)
    }
  }
}
