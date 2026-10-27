import SwiftUI

struct KanjiPrimaryRow: View {
  let kanji: ResultsList.Kanji
  let opening: RowOpening<SearchExperienceRoute>

  var body: some View {
    RowOpener(opening: opening) {
      HStack(spacing: 10) {
        Text(kanji.character)
          .font(.title.weight(.light))
        VStack(alignment: .leading, spacing: 3) {
          Text(kanji.label)
            .font(.caption2.weight(.bold))
            .foregroundStyle(.primary)
          Text(kanji.summary)
            .foregroundStyle(.primary)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .contentShape(Rectangle())
    }
    .accessibilityLabel("\(kanji.character), \(kanji.label), \(kanji.summary)")
    .accessibilityValue(kanji.spoken)
    .accessibilityIdentifier(Self.identifier(kanji.character))
  }

  static func identifier(_ character: String) -> String {
    "result.kanji-primary.\(character)"
  }
}
