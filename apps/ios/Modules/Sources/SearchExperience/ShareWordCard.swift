import SwiftUI

struct ShareWordCard: View {
  let entry: DictionaryEntry
  let savesToTheApp: Bool
  let speechSynthesisClient: SpeechSynthesisClient
  @State private var showsListPicker = false
  @State private var frequencyDisclosure: FrequencyRow?

  private static let shownSections: [WordPage.Section.Kind] = [.meaning, .frequency]

  var body: some View {
    let page = WordPage(entry)
    let frame = WordPage.frame(for: entry, page: page)
    List {
      Section {
        WordHeadline(
          ruby: JapaneseRuby(headwordOf: entry, on: page),
          pitch: page?.pitch,
          pronounceLabel: frame?.pronounce ?? "",
          identifierPrefix: "share-card",
          pronounce: { speechSynthesisClient.speak(entry.reading, .japanese) }
        )
        PartOfSpeechRow(
          title: page?.partOfSpeechRow ?? "", entryID: entry.id, conjugations: nil,
          openConjugations: { _ in })
      }
      ForEach(frame?.sections.filter { Self.shownSections.contains($0.kind) } ?? [], id: \.kind) {
        section in
        Section(section.title.uppercased()) {
          if section.kind == .meaning {
            MeaningSection(senses: page?.senses ?? [])
          } else {
            ForEach(page?.frequency ?? []) { row in
              FrequencyRankRow(row: row) { frequencyDisclosure = $0 }
            }
          }
        }
      }
      if savesToTheApp {
        Section {
          Button("Add to List", systemImage: "text.badge.plus") { showsListPicker = true }
            .font(.body)
            .accessibilityIdentifier("share-card.add-to-list")
        }
      }
    }
    .groupedList()
    .accessibilityIdentifier("share-card.word")
    .sheet(isPresented: $showsListPicker) {
      WordListPickerView(item: .word(entry))
    }
    .sheet(item: $frequencyDisclosure) { row in
      FrequencyDisclosureView(details: row.details)
    }
  }
}
