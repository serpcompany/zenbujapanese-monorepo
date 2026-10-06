import SwiftUI

struct ResultRow<Link: Hashable>: View {
  let entry: DictionaryEntry
  let summary: String
  let frequencyRanks: FrequencyRanks?
  let rank: ResultRank
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
        Text(summary)
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
    .accessibilityLabel("\(entry.headword), \(entry.reading), \(summary)")
    .accessibilityValue(
      ((isKnown ? ["Known"] : [])
        + [rank.accessibilityValue, frequencyPresentation.accessibilityValue])
        .joined(separator: ", ")
    )
    .accessibilityIdentifier(resultIdentifier)
  }

  @ViewBuilder
  private var frequencyChips: some View {
    let visible = frequencyPresentation.collapsed(
      to: dynamicTypeSize.isAccessibilitySize ? 1 : .max)
    if !visible.chips.isEmpty {
      FrequencyChipFlowLayout(spacing: chipSpacing) {
        ForEach(visible.chips.enumerated(), id: \.offset) { _, chip in
          FrequencyRankChip(presentation: chip)
        }
        if visible.hiddenCount > 0 {
          FrequencyAdditionalRanksChip(count: visible.hiddenCount)
        }
      }
      .accessibilityHidden(true)
    }
  }

  private var frequencyPresentation: SearchFrequencyRankPresentationModel {
    SearchFrequencyRankPresentationModel(ranks: frequencyRanks)
  }

  private var titleBlock: some View {
    JapaneseRubyText(
      surface: entry.headword,
      reading: entry.reading,
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
