import SwiftUI
import UIKit

struct RecognizedWordSheetRequest: Identifiable {
  let id: String
  let surface: String
  let entry: DictionaryEntry?
  let candidateEntries: [DictionaryEntry]
  let asset: ImageTextAsset

  var encounterMedia: EncounterMediaAttachment {
    EncounterMediaAttachment(name: asset.name, data: asset.data)
  }
}

struct RecognizedWordSheet<EntryContent: View>: View {
  @Environment(\.dismiss) private var dismiss

  let request: RecognizedWordSheetRequest
  @ViewBuilder let entryContent: (DictionaryEntry, EncounterMediaAttachment) -> EntryContent

  var body: some View {
    NavigationStack {
      content
        .toolbar {
          ToolbarItem(placement: .topBarTrailing) {
            Button("Done") { dismiss() }
              .accessibilityIdentifier("recognized-word-sheet.done")
          }
        }
    }
    .presentationDetents([.large])
    .presentationDragIndicator(.visible)
    .presentationBackground(Color(uiColor: .systemBackground))
    .accessibilityIdentifier("recognized-word-sheet")
  }

  @ViewBuilder
  private var content: some View {
    if let entry = request.entry {
      entryContent(entry, request.encounterMedia)
    } else if !request.candidateEntries.isEmpty {
      candidateList
    } else {
      ContentUnavailableView(
        "No Dictionary Entry",
        systemImage: "text.magnifyingglass",
        description: Text("Zenbu recognized “\(request.surface)” but found no matching entry.")
      )
      .navigationTitle("Dictionary")
      .navigationBarTitleDisplayMode(.inline)
      .accessibilityIdentifier("recognized-word-sheet.unavailable")
    }
  }

  private var candidateList: some View {
    List(request.candidateEntries) { candidate in
      NavigationLink(value: candidate) {
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
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 4)
      }
      .accessibilityLabel(
        "\(candidate.headword), \(candidate.reading), \(candidate.summary)"
      )
      .accessibilityIdentifier("recognized-word-sheet.candidate.\(candidate.id.rawValue)")
    }
    .navigationTitle("Choose “\(request.surface)”")
    .navigationBarTitleDisplayMode(.inline)
    .navigationDestination(for: DictionaryEntry.self) { entry in
      entryContent(entry, request.encounterMedia)
    }
    .accessibilityIdentifier("recognized-word-sheet.candidates")
  }
}
