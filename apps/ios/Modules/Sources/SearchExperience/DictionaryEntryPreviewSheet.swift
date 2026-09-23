import SwiftUI

struct DictionaryEntryPreviewRequest: Identifiable {
  let id: String
  let surface: String
  let entry: DictionaryEntry?
  let candidateEntries: [DictionaryEntry]
}

struct DictionaryEntryPreviewSheet: View {
  private struct MeaningItem: Identifiable {
    let id: String
    let number: Int
    let text: String
  }

  @Environment(\.dismiss) private var dismiss
  // The initially resolved entry is a deliberate one-time seed. Candidate
  // changes are local presentation state for this sheet instance.
  @State private var selectedEntry: DictionaryEntry?

  let request: DictionaryEntryPreviewRequest
  let pronounce: (String) -> Void
  let didPresentEntry: (DictionaryEntry) async -> Void

  init(
    request: DictionaryEntryPreviewRequest,
    pronounce: @escaping (String) -> Void,
    didPresentEntry: @escaping (DictionaryEntry) async -> Void
  ) {
    self.request = request
    self.pronounce = pronounce
    self.didPresentEntry = didPresentEntry
    _selectedEntry = State(initialValue: request.entry)
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        content
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(20)
      }
      .navigationTitle("Dictionary")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { dismiss() }
            .accessibilityIdentifier("dictionary-preview.done")
        }
      }
    }
    .presentationDetents([.medium, .large])
    .presentationDragIndicator(.visible)
    .task(id: selectedEntry?.id.rawValue) {
      guard let selectedEntry else { return }
      await didPresentEntry(selectedEntry)
    }
    .accessibilityIdentifier("dictionary-preview.sheet")
  }

  @ViewBuilder
  private var content: some View {
    if let selectedEntry {
      entryContent(selectedEntry)
    } else if !request.candidateEntries.isEmpty {
      candidateContent
    } else {
      ContentUnavailableView(
        "No Dictionary Entry",
        systemImage: "text.magnifyingglass",
        description: Text("Zenbu recognized “\(request.surface)” but found no matching entry.")
      )
      .accessibilityIdentifier("dictionary-preview.unavailable")
    }
  }

  private func entryContent(_ entry: DictionaryEntry) -> some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .center, spacing: 12) {
        JapaneseRubyText(
          surface: entry.headword,
          reading: entry.reading,
          baseFont: .largeTitle.weight(.light),
          rubyFont: .title3.weight(.semibold)
        )
        Spacer(minLength: 0)
        Button {
          pronounce(entry.reading)
        } label: {
          Image(systemName: "speaker.wave.2.fill")
            .frame(minWidth: 44, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .accessibilityLabel("Pronounce \(entry.reading)")
        .accessibilityIdentifier("dictionary-preview.pronounce")
      }

      if !entry.displayPartOfSpeech.isEmpty {
        Text(entry.displayPartOfSpeech)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("dictionary-preview.part-of-speech")
      }

      VStack(alignment: .leading, spacing: 10) {
        ForEach(meaningItems(entry)) { meaning in
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("\(meaning.number).")
              .foregroundStyle(.secondary)
            Text(meaning.text)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
      }
      .accessibilityIdentifier("dictionary-preview.meanings")

      if request.candidateEntries.count > 1 {
        Button("Choose Another Entry", systemImage: "list.bullet") {
          selectedEntry = nil
        }
        .accessibilityIdentifier("dictionary-preview.choose-another")
      }
    }
  }

  private var candidateContent: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Choose an entry for “\(request.surface)”")
        .font(.headline)
      ForEach(request.candidateEntries) { candidate in
        Button {
          selectedEntry = candidate
        } label: {
          VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
              Text(candidate.headword)
                .font(.headline)
              Text(candidate.reading)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
            Text(candidate.summary)
              .font(.body)
              .foregroundStyle(.primary)
              .fixedSize(horizontal: false, vertical: true)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(12)
          .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
          "\(candidate.headword), \(candidate.reading), \(candidate.summary)"
        )
        .accessibilityIdentifier("dictionary-preview.candidate.\(candidate.id.rawValue)")
      }
    }
  }

  private func meaningItems(_ entry: DictionaryEntry) -> [MeaningItem] {
    entry.meanings.enumerated().map { index, meaning in
      MeaningItem(
        id: "\(entry.id.rawValue).meaning.\(index).\(meaning)",
        number: index + 1,
        text: meaning
      )
    }
  }
}
