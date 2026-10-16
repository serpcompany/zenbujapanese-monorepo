import SwiftUI

struct NotesInSearchSection: View {
  let notes: NotesInSearch
  let open: (NotesInSearch.Row) -> Void
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    Section {
      SearchListHeading(LocalizedStringKey(notes.title))
      ForEach(notes.rows, id: \.place) { row in
        LinkRow {
          open(row)
        } label: {
          VStack(alignment: .leading, spacing: 6) {
            JapaneseRubyText(
              ruby: JapaneseRuby(surface: row.headword, reading: row.reading),
              baseFont: .title3,
              rubyFont: .caption.weight(.semibold),
              highlightsKanjiOnTap: false
            )
            .fixedSize(horizontal: false, vertical: true)
            Text(row.excerpt)
              .italic()
              .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 3)
              .fixedSize(horizontal: false, vertical: true)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .contentShape(Rectangle())
        }
        .accessibilityLabel("\(row.headword), \(row.reading), \(row.text)")
        .accessibilityIdentifier("search.note.\(row.place)")
      }
    }
  }
}
