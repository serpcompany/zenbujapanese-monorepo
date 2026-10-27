import Foundation
import ImageIO

enum SharedItem: Sendable, Equatable {
  case text(String)
  case image(Data)
}

struct ShareCardWord: Hashable, Identifiable, Sendable {
  let entry: DictionaryEntry
  let surface: String

  var id: LanguageReferenceID { entry.id }
}

struct ShareCardText: Hashable, Sendable {
  enum Source: Hashable, Sendable {
    case shared
    case photo
  }

  let source: Source
  let text: String
  let isJapanese: Bool
  let words: [ShareCardWord]
}

enum ShareCardMissing: Hashable, Sendable {
  case noText
  case unreadablePhoto
  case noJapaneseInPhoto
}

enum ShareCard: Hashable, Sendable {
  case word(DictionaryEntry)
  case text(ShareCardText)
  case missing(ShareCardMissing)

  var kind: String {
    switch self {
    case .word: "word"
    case .text(let text): text.source == .photo ? "photo" : "text"
    case .missing(let missing): "missing \(missing)"
    }
  }
}

struct ShareCardReader: Sendable {
  static let candidatesShown = 4
  static let searchResultsShown = 5
  static let longestPhotoSide = 2_048
  static let longestWord = 64
  static let longestTextRead = 2_000

  var lookUp: @Sendable (String) async -> WebsiteLinkRoute
  var search: @Sendable (SearchQuery) async throws -> LookupSearchResults
  var linkedTokens: @Sendable (String) async -> [JapaneseTextToken]
  var entries: @Sendable ([LanguageReferenceID]) async -> [LanguageReferenceID: DictionaryEntry]
  var recognize: @Sendable (ImageTextAsset) async throws -> [RecognizedImageTextObservation]
  var isJapanese: @Sendable (String) -> Bool = { PresentationCore.shared.containsJapaneseText($0) }
  var presentationReady: @Sendable () async -> Void = {
    await PresentationCore.shared.frequencyLists?.ready()
  }

  func card(for item: SharedItem) async -> ShareCard {
    await presentationReady()
    return switch item {
    case .text(let text):
      await card(forText: text.trimmingCharacters(in: .whitespacesAndNewlines))
    case .image(let data):
      await card(forPhoto: data)
    }
  }

  private func card(forText text: String) async -> ShareCard {
    guard !text.isEmpty else { return .missing(.noText) }
    if text.count <= Self.longestWord, case .open(.word(let entry, _)) = await lookUp(text) {
      return .word(entry)
    }
    guard isJapanese(text) else {
      return .text(
        ShareCardText(
          source: .shared, text: text, isJapanese: false, words: await searchedWords(text)))
    }
    let tokens = await tokens(of: text)
    if let entry = await onlyWord(of: text, in: tokens) { return .word(entry) }
    return .text(
      ShareCardText(source: .shared, text: text, isJapanese: true, words: await words(in: tokens)))
  }

  private func onlyWord(of text: String, in tokens: [JapaneseTextToken]) async -> DictionaryEntry? {
    guard tokens.count == 1, let token = tokens.first, token.surface == text,
      let word = token.entry
    else { return nil }
    return await entries([word.id])[word.id]
  }

  private func card(forPhoto data: Data) async -> ShareCard {
    guard let photo = Self.downscaled(data),
      let observations = try? await recognize(ImageTextAsset(name: "Shared photo", data: photo))
    else { return .missing(.unreadablePhoto) }
    let page = ImageTextPage(
      asset: ImageTextAsset(name: "Shared photo", data: Data()), observations: observations,
      regions: [])
    let text = page.paragraphs.map(\.text).joined(separator: "\n")
    guard isJapanese(text) else { return .missing(.noJapaneseInPhoto) }
    return .text(
      ShareCardText(
        source: .photo, text: text, isJapanese: true,
        words: await words(in: await tokens(of: text))))
  }

  private func tokens(of text: String) async -> [JapaneseTextToken] {
    await linkedTokens(String(text.prefix(Self.longestTextRead)))
  }

  private func searchedWords(_ text: String) async -> [ShareCardWord] {
    let entries = (try? await search(SearchQuery(text)))?.entries ?? []
    return entries.prefix(Self.searchResultsShown).map {
      ShareCardWord(entry: $0, surface: $0.headword)
    }
  }

  private func words(in tokens: [JapaneseTextToken]) async -> [ShareCardWord] {
    var seen = Set<LanguageReferenceID>()
    let shown = tokens.filter { !$0.isFunctionWord }
      .flatMap { token in
        (token.entry.map { [$0] } ?? Array(token.candidateEntries.prefix(Self.candidatesShown)))
          .map { (id: $0.id, surface: token.surface) }
      }
      .filter { seen.insert($0.id).inserted }
    let read = await entries(shown.map(\.id))
    return shown.compactMap { word in
      read[word.id].map { ShareCardWord(entry: $0, surface: word.surface) }
    }
  }

  static func downscaled(_ data: Data) -> Data? {
    CGImageSourceCreateWithData(data as CFData, nil).flatMap(downscaled)
  }

  static func downscaled(file: URL) -> Data? {
    CGImageSourceCreateWithURL(file as CFURL, nil).flatMap(downscaled)
  }

  private static func downscaled(_ source: CGImageSource) -> Data? {
    ImageCoding.thumbnail(from: source, maxPixelSize: longestPhotoSide)
      .flatMap { ImageCoding.jpegData($0, quality: 0.9) }
  }
}
