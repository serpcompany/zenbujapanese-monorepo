import SwiftUI

struct RecognizedWordSheetRequest: Identifiable {
  let id: String
  let surface: String
  let entry: DictionaryEntry?
  let candidateEntries: [DictionaryEntry]
  let encounterMedia: EncounterMediaAttachment?
}

@MainActor
@Observable
final class WordSheetPresentation {
  var request: RecognizedWordSheetRequest? {
    didSet {
      if let request {
        displayedRequest = request
        if request.id != oldValue?.id { detent = .medium }
      }
    }
  }
  private(set) var displayedRequest: RecognizedWordSheetRequest?
  var detent: PresentationDetent = .medium

  var isPresented: Bool { request != nil }

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
    .id(request.id)
    .presentationDetents([.medium, .large], selection: $detent)
    .presentationBackgroundInteraction(.enabled(upThrough: .medium))
    .presentationDragIndicator(.visible)
    .presentationBackground(SystemColor.background)
    .sheetSize(onMac: AppWindow.sheetSize)
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
      .inlineNavigationTitle()
      .toolbar {
        ToolbarItem(placement: .sheetClose) { closeButton }
      }
      .accessibilityIdentifier("recognized-word-sheet.unavailable")
    }
  }

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
      ToolbarItem(placement: .sheetClose) { closeButton }
    }
    .navigationTitle("Choose “\(request.surface)”")
    .inlineNavigationTitle()
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
      .toolbar(removing: .title)
      .toolbar {
        SheetCloseAndAction {
          closeButton
        } action: {
          Button("Open Full Entry", systemImage: "arrow.up.left.and.arrow.down.right") {
            openFullEntry(entry)
          }
          .accessibilityIdentifier("recognized-word-sheet.open-full-entry")
        }
      }
  }
}
