import SwiftUI

struct ResultRow<Link: Hashable>: View {
  let entry: DictionaryEntry
  let row: ListedWord
  let link: Link
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Environment(WordKnowledge.self) private var wordKnowledge
  @ScaledMetric(relativeTo: .caption) private var chipSpacing = 6.0

  var body: some View {
    let isKnown = wordKnowledge.isKnown(entry.id)
    NavigationLink(value: link) {
      VStack(alignment: .leading, spacing: 6) {
        HStack(alignment: .lastTextBaseline, spacing: 8) {
          titleBlock
          Spacer(minLength: 0)
          if isKnown {
            KnownWordBadge()
          }
        }
        Text(row.summary)
          .font(.body)
          .foregroundStyle(.primary)
          .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
          .fixedSize(horizontal: false, vertical: true)
        frequencyChips
          .padding(.top, 4)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(Rectangle())
      .alignmentGuide(.listRowSeparatorLeading) { $0[.leading] }
    }
    .swipeActions(edge: .leading) {
      KnownWordMenuButton(item: .word(entry), identifierPrefix: resultIdentifier)
        .tint(isKnown ? .orange : .green)
    }
    .contextMenu {
      KnownWordMenuButton(item: .word(entry), identifierPrefix: resultIdentifier)
    }
    .accessibilityLabel("\(entry.headword), \(entry.reading), \(row.summary)")
    .accessibilityValue(row.spoken)
    .accessibilityIdentifier(resultIdentifier)
  }

  @ViewBuilder
  private var frequencyChips: some View {
    let (shown, hidden) = row.chips(onlyFirst: dynamicTypeSize.isAccessibilitySize)
    if !shown.isEmpty {
      FrequencyChipFlowLayout(spacing: chipSpacing) {
        ForEach(shown.enumerated(), id: \.offset) { _, chip in
          FrequencyRankChip(chip: chip)
        }
        if hidden > 0 {
          FrequencyAdditionalRanksChip(count: hidden)
        }
      }
      .accessibilityHidden(true)
    }
  }

  private var titleBlock: some View {
    JapaneseRubyText(
      ruby: JapaneseRuby(surface: entry.headword, reading: entry.reading),
      baseFont: .title3,
      rubyFont: .caption.weight(.semibold),
      highlightsKanjiOnTap: false
    )
    .fixedSize(horizontal: false, vertical: true)
  }

  private var resultIdentifier: String {
    switch entry.headword {
    case "問題": "result.problem"
    case "日本": "result.japan"
    default: "result.\(entry.id.rawValue)"
    }
  }
}
