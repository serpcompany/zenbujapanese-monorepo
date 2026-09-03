import CoreGraphics
import Foundation
import Observation

@MainActor
@Observable
final class ImageTextFlowModel {
  enum TranslationState {
    case idle
    case translating
    case translated(String)
    case failed
  }
  enum PageState {
    case loading
    case loaded(ImageTextPage)
    case failed
  }

  struct Page: Identifiable {
    let asset: ImageTextAsset
    var state: PageState = .loading
    var id: UUID { asset.id }
  }

  private(set) var pages: [Page]
  var selectedPage = 0
  var selectedRegion: ImageTextRegion?
  var showsHighlights = true
  var noTextAlertPage: Int?
  var translationState: TranslationState = .idle
  private var translationTask: Task<Void, Never>?
  private var translationInvocationID: UUID?
  private let recognitionClient: ImageTextRecognitionClient
  private let textAnalysisClient: JapaneseTextAnalysisClient
  private let translationClient: NaturalTranslationClient

  init(
    assets: [ImageTextAsset],
    recognitionClient: ImageTextRecognitionClient,
    textAnalysisClient: JapaneseTextAnalysisClient,
    translationClient: NaturalTranslationClient
  ) {
    pages = assets.map { Page(asset: $0) }
    self.recognitionClient = recognitionClient
    self.textAnalysisClient = textAnalysisClient
    self.translationClient = translationClient
  }

  func load() async {
    for index in pages.indices {
      do {
        try Task.checkCancellation()
        let observations = try await recognitionClient.recognize(pages[index].asset)
        let page = await Self.page(
          asset: pages[index].asset,
          observations: observations,
          textAnalysisClient: textAnalysisClient
        )
        try Task.checkCancellation()
        pages[index].state = .loaded(page)
        if !page.hasJapaneseText, selectedPage == index, noTextAlertPage == nil {
          noTextAlertPage = index
        }
      } catch is CancellationError {
        return
      } catch {
        guard !Task.isCancelled else { return }
        pages[index].state = .failed
      }
    }
  }

  func selectPage(_ index: Int) {
    guard pages.indices.contains(index) else { return }
    selectedPage = index
    selectedRegion = nil
    cancelTranslation()
    if case .loaded(let page) = pages[index].state, !page.hasJapaneseText {
      noTextAlertPage = index
    }
  }

  var copiedText: String {
    guard pages.indices.contains(selectedPage), case .loaded(let page) = pages[selectedPage].state
    else {
      return ""
    }
    return page.observations.map(\.text).joined(separator: "\n")
  }

  var selectedSharePayload: ImageTextAsset? {
    guard pages.indices.contains(selectedPage) else { return nil }
    return pages[selectedPage].asset
  }

  var canRequestTranslation: Bool { !copiedText.isEmpty }

  func requestTranslation() {
    let source = copiedText
    guard !source.isEmpty else { return }
    let pageID = pages[selectedPage].id
    let invocationID = UUID()
    translationTask?.cancel()
    translationInvocationID = invocationID
    translationState = .translating
    translationTask = Task { [translationClient] in
      do {
        let translation = try await translationClient.translate(source)
        try Task.checkCancellation()
        guard translationInvocationID == invocationID,
          pages.indices.contains(selectedPage), pages[selectedPage].id == pageID
        else { return }
        translationState = .translated(translation)
      } catch is CancellationError {
        return
      } catch {
        guard !Task.isCancelled, translationInvocationID == invocationID,
          pages.indices.contains(selectedPage), pages[selectedPage].id == pageID
        else { return }
        translationState = .failed
      }
      guard translationInvocationID == invocationID else { return }
      translationTask = nil
      translationInvocationID = nil
    }
  }

  func cancelTranslation() {
    translationTask?.cancel()
    translationTask = nil
    translationInvocationID = nil
    translationState = .idle
  }

  func suspendTranslation() {
    translationTask?.cancel()
    translationTask = nil
    translationInvocationID = nil
    if case .translating = translationState {
      translationState = .idle
    }
  }

  private static func page(
    asset: ImageTextAsset,
    observations: [RecognizedImageTextObservation],
    textAnalysisClient: JapaneseTextAnalysisClient
  ) async -> ImageTextPage {
    var regions: [ImageTextRegion] = []
    for observation in observations {
      let tokens = await textAnalysisClient.linkedTokens(observation.text, SearchQuery(""), nil)
      for token in tokens {
        let entries = token.entry.map { [$0] } ?? token.candidateEntries
        guard !entries.isEmpty,
          let box = boundingBox(forScalarRange: token.scalarRange, in: observation)
        else { continue }
        regions.append(
          ImageTextRegion(
            id: "\(observation.id).\(token.id)",
            surface: token.surface,
            boundingBox: box,
            entry: token.entry,
            candidateEntries: entries
          ))
      }
    }
    return ImageTextPage(asset: asset, observations: observations, regions: regions)
  }

  private static func boundingBox(
    forScalarRange range: Range<Int>,
    in observation: RecognizedImageTextObservation
  ) -> CGRect? {
    let scalarCount = observation.text.unicodeScalars.count
    guard range.lowerBound >= 0, range.upperBound <= scalarCount,
      range.lowerBound < range.upperBound
    else { return nil }
    if range == 0..<scalarCount { return observation.boundingBox }

    let characters = Array(observation.text)
    guard observation.characterBoxes.count == characters.count else { return nil }
    var scalarOffset = 0
    var coveredScalars = 0
    var boxes: [CGRect] = []
    for (character, box) in zip(characters, observation.characterBoxes) {
      let nextOffset = scalarOffset + character.unicodeScalars.count
      let characterRange = scalarOffset..<nextOffset
      if characterRange.overlaps(range) {
        guard characterRange.lowerBound >= range.lowerBound,
          characterRange.upperBound <= range.upperBound,
          !box.isNull, !box.isEmpty
        else { return nil }
        coveredScalars += characterRange.count
        boxes.append(box)
      }
      scalarOffset = nextOffset
    }
    guard coveredScalars == range.count, let first = boxes.first else { return nil }
    return boxes.dropFirst().reduce(first) { $0.union($1) }
  }
}

struct ImageTextPage {
  let asset: ImageTextAsset
  let observations: [RecognizedImageTextObservation]
  let regions: [ImageTextRegion]

  var hasJapaneseText: Bool {
    observations.contains { observation in
      observation.text.contains { character in
        character.unicodeScalars.contains {
          (0x3040...0x30FF).contains($0.value)
            || (0x3400...0x9FFF).contains($0.value)
            || (0x20000...0x2FA1F).contains($0.value)
        }
      }
    }
  }
}

struct ImageTextRegion: Identifiable {
  let id: String
  let surface: String
  let boundingBox: CGRect
  let entry: DictionaryEntry?
  let candidateEntries: [DictionaryEntry]
}
