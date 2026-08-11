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
    guard pages.indices.contains(selectedPage), case .loaded(let page) = pages[selectedPage].state else {
      return ""
    }
    return page.observations.map(\.text).joined(separator: "\n")
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
          pages.indices.contains(selectedPage), pages[selectedPage].id == pageID else { return }
        translationState = .translated(translation)
      } catch is CancellationError {
        return
      } catch {
        guard !Task.isCancelled, translationInvocationID == invocationID,
          pages.indices.contains(selectedPage), pages[selectedPage].id == pageID else { return }
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
    let ideographs = observations.flatMap(ideographUnits)
    var groupedUnitIDs = Set<String>()
    for unit in ideographs {
      let candidates = ideographs.filter {
        $0.id != unit.id && $0.observationID != unit.observationID
          && $0.boundingBox.minX >= unit.boundingBox.maxX
          && abs($0.boundingBox.midY - unit.boundingBox.midY)
            <= max($0.boundingBox.height, unit.boundingBox.height) * 0.55
          && $0.boundingBox.minX - unit.boundingBox.maxX <= 0.25
      }
      guard let neighbor = candidates.min(by: {
        $0.boundingBox.minX - unit.boundingBox.maxX
          < $1.boundingBox.minX - unit.boundingBox.maxX
      }) else { continue }
      let combined = unit.surface + neighbor.surface
      let linked = await textAnalysisClient.linkedTokens(combined, SearchQuery(""), nil)
      guard let token = linked.first(where: {
        $0.surface == combined && $0.entry?.headword == combined
      }), let entry = token.entry else { continue }
      regions.append(ImageTextRegion(
        id: "grouped.\(unit.id).\(neighbor.id)",
        surface: unit.surface,
        boundingBox: unit.boundingBox,
        entry: entry
      ))
      groupedUnitIDs.insert(unit.id)
    }
    for observation in observations {
      let tokens = await textAnalysisClient.linkedTokens(observation.text, SearchQuery(""), nil)
      let characterCount = max(observation.text.count, 1)
      var offset = 0
      for token in tokens {
        defer { offset += token.surface.count }
        guard let entry = token.entry else { continue }
        let isVertical = observation.boundingBox.height > observation.boundingBox.width * 1.5
        let start = CGFloat(offset) / CGFloat(characterCount)
        let span = max(CGFloat(token.surface.count) / CGFloat(characterCount), 0.05)
        let box = isVertical
          ? CGRect(
            x: observation.boundingBox.minX,
            y: observation.boundingBox.maxY - observation.boundingBox.height * (start + span),
            width: observation.boundingBox.width,
            height: observation.boundingBox.height * span
          )
          : CGRect(
            x: observation.boundingBox.minX + observation.boundingBox.width * start,
            y: observation.boundingBox.minY,
            width: min(observation.boundingBox.width * span, 1 - observation.boundingBox.minX),
            height: observation.boundingBox.height
          )
        let tokenUnitIDs = ideographs.filter {
          $0.observationID == observation.id && token.surface.contains($0.surface)
        }.map(\.id)
        if tokenUnitIDs.contains(where: groupedUnitIDs.contains) { continue }
        regions.append(ImageTextRegion(
          id: "\(observation.id).\(token.id)",
          surface: token.surface,
          boundingBox: box,
          entry: entry
        ))
      }
    }
    return ImageTextPage(asset: asset, observations: observations, regions: regions)
  }

  private static func ideographUnits(
    _ observation: RecognizedImageTextObservation
  ) -> [ImageTextIdeographUnit] {
    let characters = Array(observation.text)
    guard !characters.isEmpty else { return [] }
    let vertical = observation.boundingBox.height > observation.boundingBox.width * 1.5
    return characters.enumerated().compactMap { index, character in
      let surface = String(character)
      guard surface.isSingleIdeograph else { return nil }
      let fraction = CGFloat(index) / CGFloat(characters.count)
      let span = 1 / CGFloat(characters.count)
      let box = vertical
        ? CGRect(
          x: observation.boundingBox.minX,
          y: observation.boundingBox.maxY - observation.boundingBox.height * (fraction + span),
          width: observation.boundingBox.width,
          height: observation.boundingBox.height * span
        )
        : CGRect(
          x: observation.boundingBox.minX + observation.boundingBox.width * fraction,
          y: observation.boundingBox.minY,
          width: observation.boundingBox.width * span,
          height: observation.boundingBox.height
        )
      return ImageTextIdeographUnit(
        id: "\(observation.id).\(index)",
        observationID: observation.id,
        surface: surface,
        boundingBox: box
      )
    }
  }
}

private struct ImageTextIdeographUnit {
  let id: String
  let observationID: Int
  let surface: String
  let boundingBox: CGRect
}

private extension String {
  var isSingleIdeograph: Bool {
    guard count == 1, let scalar = unicodeScalars.first else { return false }
    return (0x3400...0x4DBF).contains(scalar.value)
      || (0x4E00...0x9FFF).contains(scalar.value)
      || (0x20000...0x2FA1F).contains(scalar.value)
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
  let entry: DictionaryEntry
}
