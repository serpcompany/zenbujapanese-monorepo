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

/// Which word the half-height word sheet shows. Tapping another word while the sheet is open
/// swaps the word in the same sheet and returns it to half height: with `sheet(item:)` the new
/// word dismissed and re-presented the sheet, which reopened at full height.
@MainActor
@Observable
final class WordSheetPresentation {
  var request: RecognizedWordSheetRequest? {
    didSet {
      if request != nil, request?.id != oldValue?.id { detent = .medium }
    }
  }
  var detent: PresentationDetent = .medium

  var isPresented: Bool { request != nil }

  /// For `sheet(isPresented:)`, which stays presented while `request` changes.
  var isPresentedBinding: Binding<Bool> {
    Binding(
      get: { self.request != nil },
      set: { if !$0 { self.request = nil } }
    )
  }

  var requestBinding: Binding<RecognizedWordSheetRequest?> {
    Binding(get: { self.request }, set: { self.request = $0 })
  }
}

struct RecognizedWordSheet<EntryContent: View>: View {
  @Environment(\.dismiss) private var dismiss
  @State private var candidateRanks: [LanguageReferenceID: FrequencyRanks] = [:]

  let request: RecognizedWordSheetRequest
  /// Half or full height. The sheet opens at half height and leaves the screen behind usable, so
  /// a playing video or the tapped word in an image stays visible and another word can be tapped.
  @Binding var detent: PresentationDetent
  let openFullEntry: (DictionaryEntry) -> Void
  private let entryContent: (DictionaryEntry, EncounterMediaAttachment?) -> EntryContent

  init(
    request: RecognizedWordSheetRequest,
    detent: Binding<PresentationDetent>,
    openFullEntry: @escaping (DictionaryEntry) -> Void,
    @ViewBuilder entryContent: @escaping (DictionaryEntry, EncounterMediaAttachment?) -> EntryContent
  ) {
    self.request = request
    _detent = detent
    self.openFullEntry = openFullEntry
    self.entryContent = entryContent
  }

  var body: some View {
    NavigationStack {
      content
    }
    // A new word starts a fresh stack, so a candidate chosen for the last word doesn't linger.
    .id(request.id)
    .presentationDetents([.medium, .large], selection: $detent)
    .presentationBackgroundInteraction(.enabled(upThrough: .medium))
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
