import SwiftUI
import UIKit

struct RecognizedWordSheetRequest: Identifiable {
  let id: String
  let surface: String
  let entry: DictionaryEntry?
  let candidateEntries: [DictionaryEntry]
  /// The image the word was found in, offered as the word's encounter media.
  let encounterMedia: EncounterMediaAttachment?
}

struct RecognizedWordSheet<EntryContent: View>: View {
  @Environment(\.dismiss) private var dismiss
  @State private var candidateRanks: [LanguageReferenceID: FrequencyRanks] = [:]

  let request: RecognizedWordSheetRequest
  /// Opens at half height and leaves the screen behind usable, so a playing video or the tapped
  /// word in an image stays visible and another word can be tapped.
  let opensAtHalfHeight: Bool
  let openFullEntry: (DictionaryEntry) -> Void
  private let entryContent: (DictionaryEntry, EncounterMediaAttachment?) -> EntryContent

  init(
    request: RecognizedWordSheetRequest,
    opensAtHalfHeight: Bool = false,
    openFullEntry: @escaping (DictionaryEntry) -> Void,
    @ViewBuilder entryContent: @escaping (DictionaryEntry, EncounterMediaAttachment?) -> EntryContent
  ) {
    self.request = request
    self.opensAtHalfHeight = opensAtHalfHeight
    self.openFullEntry = openFullEntry
    self.entryContent = entryContent
  }

  var body: some View {
    NavigationStack {
      content
    }
    .presentationDetents(opensAtHalfHeight ? [.medium, .large] : [.large])
    .presentationBackgroundInteraction(
      opensAtHalfHeight ? .enabled(upThrough: .medium) : .automatic)
    .presentationDragIndicator(.visible)
    .presentationBackground(Color(uiColor: .systemBackground))
    .accessibilityIdentifier("recognized-word-sheet")
  }

  @ViewBuilder
  private var content: some View {
    if let entry = request.entry {
      presentedEntry(entry)
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
      .toolbar {
        ToolbarItem(placement: .topBarLeading) { closeButton }
      }
      .accessibilityIdentifier("recognized-word-sheet.unavailable")
    }
  }

  /// The possible entries, shown with the same rows as Search results.
  private var candidateList: some View {
    List(request.candidateEntries.enumerated(), id: \.element.id) { index, candidate in
      ResultRow(
        entry: candidate,
        summary: candidate.summary,
        frequencyRanks: candidateRanks[candidate.id],
        rank: .result(position: index + 1, count: request.candidateEntries.count),
        link: candidate
      )
    }
    .listStyle(.plain)
    .task(id: request.id) {
      candidateRanks =
        (try? await FrequencyCapability.live.evidence(for: request.candidateEntries.map(\.id)))
        ?? [:]
    }
    .toolbar {
      ToolbarItem(placement: .topBarLeading) { closeButton }
    }
    .navigationTitle("Choose “\(request.surface)”")
    .navigationBarTitleDisplayMode(.inline)
    .navigationDestination(for: DictionaryEntry.self) { entry in
      presentedEntry(entry)
    }
    .accessibilityIdentifier("recognized-word-sheet.candidates")
  }

  private var closeButton: some View {
    Button(role: .close) { dismiss() }
      .accessibilityIdentifier("recognized-word-sheet.done")
  }

  private func presentedEntry(_ entry: DictionaryEntry) -> some View {
    entryContent(entry, request.encounterMedia)
      // The headword card right below already names the word.
      .toolbar(removing: .title)
      .toolbar {
        // Next to the word's title, so it reads as "open this word".
        // Close first, then Open Full Entry beside it; the word's own actions sit trailing.
        ToolbarItemGroup(placement: .topBarLeading) {
          closeButton
          Button("Open Full Entry", systemImage: "arrow.up.left.and.arrow.down.right") {
            openFullEntry(entry)
          }
          .accessibilityIdentifier("recognized-word-sheet.open-full-entry")
        }
      }
  }
}
