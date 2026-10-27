import SwiftUI

struct ShareCardView: View {
  let item: SharedItem?
  let reader: ShareCardReader
  let translation: NaturalTranslationClient
  let savesToTheApp: Bool
  let done: () -> Void
  @State private var card: ShareCard?

  var body: some View {
    NavigationStack {
      content
        .shareCardChrome(title: title, done: done)
        .navigationDestination(for: DictionaryEntry.self) { entry in
          wordCard(entry)
            .shareCardChrome(title: entry.headword, done: done)
        }
    }
    .task(id: item) {
      guard let item else { return }
      let card = await reader.card(for: item)
      ShareCardMemory.note("card \(card.kind)")
      self.card = card
    }
  }

  @ViewBuilder
  private var content: some View {
    switch card {
    case nil:
      ProgressView("Looking Up")
        .accessibilityIdentifier("share-card.loading")
    case .word(let entry):
      wordCard(entry)
    case .text(let text):
      ShareTextCard(text: text, translation: translation)
    case .missing(let missing):
      ShareCardMissingView(missing: missing)
    }
  }

  private var title: String {
    switch card {
    case .word(let entry): entry.headword
    case .text(let text) where text.source == .photo: String(localized: "Photo")
    default: String(localized: "Zenbu")
    }
  }

  private func wordCard(_ entry: DictionaryEntry) -> some View {
    ShareWordCard(entry: entry, savesToTheApp: savesToTheApp, speechSynthesisClient: .live)
  }
}

enum ShareCardTranslation: Equatable {
  case translating
  case translated(String)
  case needsLanguages
  case unavailable

  static func of(_ text: String, by client: NaturalTranslationClient) async -> Self {
    switch try? await client.availability() {
    case .installed:
      guard let translated = try? await client.translateInstalled(text) else { return .unavailable }
      return .translated(translated)
    case .downloadable:
      return .needsLanguages
    default:
      return .unavailable
    }
  }
}

struct ShareTextCard: View {
  let text: ShareCardText
  let translation: NaturalTranslationClient
  @Environment(WordKnowledge.self) private var wordKnowledge
  @State private var translated = ShareCardTranslation.translating

  var body: some View {
    List {
      if text.isJapanese {
        Section("Translation") { translationRow }
      }
      Section(text.source == .photo ? "Text in the Photo" : "Shared Text") {
        Text(text.text)
          .textSelection(.enabled)
          .accessibilityIdentifier("share-card.text")
      }
      Section("Words") { words }
    }
    .groupedList()
    .accessibilityIdentifier("share-card.\(text.source == .photo ? "photo" : "text")")
    .task(id: text) {
      guard text.isJapanese else { return }
      translated = await .of(text.text, by: translation)
      ShareCardMemory.note("translation")
    }
  }

  @ViewBuilder
  private var translationRow: some View {
    switch translated {
    case .translating:
      ProgressView()
        .accessibilityIdentifier("share-card.translating")
    case .translated(let english):
      Text(english)
        .textSelection(.enabled)
        .accessibilityIdentifier("share-card.translation")
    case .needsLanguages:
      Text("Download Japanese and English in Zenbu’s Translate tab to see a translation here.")
        .foregroundStyle(.secondary)
        .accessibilityIdentifier("share-card.translation-needs-languages")
    case .unavailable:
      Text("A translation isn’t available for this text.")
        .foregroundStyle(.secondary)
        .accessibilityIdentifier("share-card.translation-unavailable")
    }
  }

  @ViewBuilder
  private var words: some View {
    let entries = text.words.map(\.entry)
    let rows = WordRowsRequest(
      entries: entries.map { WordRowsRequest.Entry(id: $0.id.rawValue, summary: $0.summary) },
      known: wordKnowledge.ids(.known, among: entries)
    ).rowsByEntry()
    if entries.isEmpty {
      Text("No dictionary words found in this text.")
        .foregroundStyle(.secondary)
        .accessibilityIdentifier("share-card.no-words")
    }
    ForEach(entries) { entry in
      if let row = rows[entry.id.rawValue] {
        ResultRow(entry: entry, row: row, link: entry)
      }
    }
  }
}

struct ShareCardMissingView: View {
  let missing: ShareCardMissing

  var body: some View {
    switch missing {
    case .noText:
      ContentUnavailableView(
        "Nothing to Look Up", systemImage: "text.magnifyingglass",
        description: Text("Share a word, a sentence, or a photo of Japanese text."))
      .accessibilityIdentifier("share-card.no-text")
    case .unreadablePhoto:
      ContentUnavailableView(
        "Couldn’t Open the Photo", systemImage: "photo.badge.exclamationmark",
        description: Text("Zenbu couldn’t read this image."))
      .accessibilityIdentifier("share-card.unreadable-photo")
    case .noJapaneseInPhoto:
      ContentUnavailableView(
        "No Japanese Found", systemImage: "text.viewfinder",
        description: Text("Zenbu found no Japanese text in this photo."))
      .accessibilityIdentifier("share-card.no-japanese")
    }
  }
}

extension View {
  fileprivate func shareCardChrome(title: String, done: @escaping () -> Void) -> some View {
    navigationTitle(title)
      .inlineNavigationTitle()
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done", action: done)
            .accessibilityIdentifier("share-card.done")
        }
      }
  }
}
