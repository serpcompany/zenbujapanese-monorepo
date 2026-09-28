import CoreGraphics
import Foundation
import Observation

@MainActor
@Observable
final class ImageTextFlowModel {
  enum TranslationState {
    case idle
    case checkingAvailability
    case preparing
    case translating
    /// Natural translations keyed by their Japanese source text.
    case translated([String: String])
    case cancelled
    case unsupported
    case preparationFailed
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
  private(set) var pendingTranslationPreparation: PendingTranslationPreparation?
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
    selectedLoadedPage?.observations.map(\.text).joined(separator: "\n") ?? ""
  }

  var selectedLoadedPage: ImageTextPage? {
    guard pages.indices.contains(selectedPage), case .loaded(let page) = pages[selectedPage].state
    else { return nil }
    return page
  }

  /// Every paragraph and line of the selected page, so Translate and the line cards share one
  /// translation pass.
  var translationSources: [String] {
    guard let page = selectedLoadedPage else { return [] }
    var seen = Set<String>()
    return (page.paragraphs.map(\.text) + page.lines.map(\.text)).filter { seen.insert($0).inserted }
  }

  func translation(of source: String) -> String? {
    guard case .translated(let translations) = translationState else { return nil }
    return translations[source]
  }

  var selectedSharePayload: ImageTextAsset? {
    guard pages.indices.contains(selectedPage) else { return nil }
    return pages[selectedPage].asset
  }

  var canRequestTranslation: Bool { !translationSources.isEmpty }

  func requestTranslation() {
    let source = translationSources
    guard !source.isEmpty else { return }
    guard case .idle = translationState else { return }
    guard translationTask == nil else { return }
    let pageID = pages[selectedPage].id
    let invocationID = UUID()
    translationInvocationID = invocationID
    translationState = .checkingAvailability
    translationTask = Task { [translationClient] in
      do {
        let availability = try await translationClient.availability()
        try Task.checkCancellation()
        guard translationInvocationID == invocationID,
          pages.indices.contains(selectedPage), pages[selectedPage].id == pageID
        else { return }
        guard availability == .installed else {
          if availability == .downloadable {
            translationState = .preparing
            pendingTranslationPreparation = PendingTranslationPreparation(
              id: invocationID,
              source: source,
              pageID: pageID
            )
          } else {
            translationState = .unsupported
          }
          translationTask = nil
          translationInvocationID = nil
          return
        }
        translationState = .translating
        let translations = try await translationClient.translateAllInstalled(source)
        try Task.checkCancellation()
        guard translationInvocationID == invocationID,
          pages.indices.contains(selectedPage), pages[selectedPage].id == pageID
        else { return }
        translationState = .translated(translations)
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

  func claimPendingTranslationPreparation(
    id expectedID: UUID? = nil
  ) -> PendingTranslationPreparation? {
    guard case .preparing = translationState,
      let pendingTranslationPreparation,
      expectedID == nil || pendingTranslationPreparation.id == expectedID,
      translationInvocationID == nil
    else { return nil }
    translationInvocationID = pendingTranslationPreparation.id
    return pendingTranslationPreparation
  }

  @discardableResult
  func beginPreparedTranslation(_ request: PendingTranslationPreparation) -> Bool {
    guard isCurrent(request) else { return false }
    translationState = .translating
    return true
  }

  func finishPreparedTranslation(
    _ translations: [String: String],
    for request: PendingTranslationPreparation
  ) {
    guard isCurrent(request) else { return }
    translationState = .translated(translations)
    pendingTranslationPreparation = nil
    translationInvocationID = nil
  }

  func cancelPreparedTranslation(_ request: PendingTranslationPreparation) {
    guard isCurrent(request) else { return }
    translationState = .cancelled
    pendingTranslationPreparation = nil
    translationInvocationID = nil
  }

  func failPreparedTranslation(_ request: PendingTranslationPreparation) {
    guard isCurrent(request) else { return }
    translationState = .preparationFailed
    pendingTranslationPreparation = nil
    translationInvocationID = nil
  }

  func retryTranslation() {
    switch translationState {
    case .cancelled, .preparationFailed, .failed:
      translationState = .idle
      requestTranslation()
    case .idle, .checkingAvailability, .preparing, .translating, .translated, .unsupported:
      return
    }
  }

  struct PendingTranslationPreparation: Identifiable, Equatable {
    let id: UUID
    let source: [String]
    let pageID: UUID
  }

  private func isCurrent(_ request: PendingTranslationPreparation) -> Bool {
    translationInvocationID == request.id
      && pages.indices.contains(selectedPage)
      && pages[selectedPage].id == request.pageID
  }

  func cancelTranslation() {
    translationTask?.cancel()
    translationTask = nil
    translationInvocationID = nil
    pendingTranslationPreparation = nil
    translationState = .idle
  }

  func suspendTranslation() {
    translationTask?.cancel()
    translationTask = nil
    translationInvocationID = nil
    pendingTranslationPreparation = nil
    if case .translating = translationState {
      translationState = .idle
    }
    if case .preparing = translationState {
      translationState = .idle
    }
    if case .checkingAvailability = translationState {
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
      var indexInLine = 0
      for token in tokens {
        let entries = token.entry.map { [$0] } ?? token.candidateEntries
        guard token.surface.containsJapaneseText,
          let box = boundingBox(forScalarRange: token.scalarRange, in: observation)
        else { continue }
        regions.append(
          ImageTextRegion(
            id: "\(observation.id).\(token.id)",
            surface: token.surface,
            boundingBox: box,
            entry: token.entry,
            candidateEntries: entries,
            lineID: observation.id,
            isVertical: observation.isVertical,
            indexInLine: indexInLine
          ))
        indexInLine += 1
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
  /// Recognized lines that contain Japanese, in reading order.
  let lines: [ImageTextLine]
  let paragraphs: [ImageTextParagraph]

  init(
    asset: ImageTextAsset,
    observations: [RecognizedImageTextObservation],
    regions: [ImageTextRegion]
  ) {
    self.asset = asset
    self.observations = observations
    self.regions = regions
    lines = observations.filter { $0.text.containsJapaneseText }.map(ImageTextLine.init)
    paragraphs = ImageTextParagraph.group(lines)
  }

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
  let lineID: Int
  let isVertical: Bool
  let indexInLine: Int

  func sheetRequest(asset: ImageTextAsset) -> RecognizedWordSheetRequest {
    RecognizedWordSheetRequest(
      id: "\(asset.id).\(id)",
      surface: surface,
      entry: entry,
      candidateEntries: candidateEntries,
      encounterMedia: EncounterMediaAttachment(name: asset.name, data: asset.data)
    )
  }
}

struct ImageTextLine: Identifiable, Equatable {
  let id: Int
  let text: String
  let boundingBox: CGRect
  let isVertical: Bool

  init(_ observation: RecognizedImageTextObservation) {
    id = observation.id
    text = observation.text
    boundingBox = observation.boundingBox
    isVertical = observation.isVertical
  }

  init(id: Int, text: String, boundingBox: CGRect, isVertical: Bool) {
    self.id = id
    self.text = text
    self.boundingBox = boundingBox
    self.isVertical = isVertical
  }

  /// Length along the reading direction, in normalized image coordinates.
  var extent: CGFloat { isVertical ? boundingBox.height : boundingBox.width }
  /// Size across the reading direction, which tracks the font size.
  var thickness: CGFloat { isVertical ? boundingBox.width : boundingBox.height }
  var endsSentence: Bool { text.last.map { "。．！？!?」』".contains($0) } ?? false }

  /// Whether `next` carries on in the same column or row, as when recognition splits one line
  /// in two. Vision's y axis points up, so a later piece of a column sits lower.
  func isContinued(by next: ImageTextLine) -> Bool {
    guard next.isVertical == isVertical else { return false }
    let box = boundingBox
    let nextBox = next.boundingBox
    let minimumOverlap = min(thickness, next.thickness) * 0.5
    if isVertical {
      let overlap = min(box.maxX, nextBox.maxX) - max(box.minX, nextBox.minX)
      return overlap > minimumOverlap && nextBox.midY < box.midY
    }
    let overlap = min(box.maxY, nextBox.maxY) - max(box.minY, nextBox.minY)
    return overlap > minimumOverlap && nextBox.midX > box.midX
  }
}

struct ImageTextParagraph: Identifiable, Equatable {
  let lines: [ImageTextLine]
  var id: Int { lines[0].id }
  var text: String { lines.map(\.text).joined() }

  /// Joins lines that wrap, as columns on a book page do. A line wraps into the next when it
  /// runs the full length of the text block, doesn't end a sentence, and the next line has the
  /// same direction and font size. Blocks with fewer than two full-length lines are treated as
  /// lists, so a list whose longest item reaches the edge keeps every item separate. Pieces of
  /// one column or row that recognition split apart are always joined.
  static func group(_ lines: [ImageTextLine]) -> [ImageTextParagraph] {
    let longest = lines.map(\.extent).max() ?? 0
    let isFullLength = { (line: ImageTextLine) in line.extent >= longest * 0.9 }
    let wraps = lines.count >= 3 && lines.filter(isFullLength).count >= 2
    var paragraphs: [ImageTextParagraph] = []
    var current: [ImageTextLine] = []
    for (index, line) in lines.enumerated() {
      current.append(line)
      let next = lines.indices.contains(index + 1) ? lines[index + 1] : nil
      let continues =
        if let next {
          line.isContinued(by: next)
            || (wraps && isFullLength(line) && !line.endsSentence
              && next.isVertical == line.isVertical
              && abs(next.thickness - line.thickness) <= line.thickness * 0.25)
        } else { false }
      if !continues {
        paragraphs.append(ImageTextParagraph(lines: current))
        current = []
      }
    }
    return paragraphs
  }
}

extension String {
  fileprivate var containsJapaneseText: Bool {
    contains { character in
      character.unicodeScalars.contains {
        (0x3040...0x30FF).contains($0.value)
          || (0x3400...0x9FFF).contains($0.value)
          || (0x20000...0x2FA1F).contains($0.value)
      }
    }
  }
}
