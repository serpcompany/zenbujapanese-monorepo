import Foundation
import ImageIO
import UniformTypeIdentifiers
import Observation

struct ImageTextAsset: Identifiable, Sendable {
  let id: UUID
  let name: String
  let data: Data

  init(id: UUID = UUID(), name: String, data: Data) {
    self.id = id
    self.name = name
    self.data = data
  }

  static func loadCopy(from url: URL) async throws -> ImageTextAsset {
    let worker = Task.detached(priority: .userInitiated) {
      try Task.checkCancellation()
      let asset = try readCopy(from: url)
      try Task.checkCancellation()
      return asset
    }
    return try await withTaskCancellationHandler {
      try await worker.value
    } onCancel: {
      worker.cancel()
    }
  }

  static func readCopy(from url: URL) throws -> ImageTextAsset {
    let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
    let byteCount = attributes[.size] as? Int ?? 0
    guard byteCount > 0, byteCount <= 12 * 1_024 * 1_024 else {
      throw ImageTextAssetError.unsupportedSize
    }
    let data = try Data(contentsOf: url)
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      hasReadableDimensions(source)
    else {
      throw ImageTextAssetError.unsupportedDimensions
    }
    return ImageTextAsset(name: url.lastPathComponent, data: data)
  }

  static func dropped(_ provider: NSItemProvider) async -> ImageTextAsset? {
    await withCheckedContinuation { continuation in
      _ = provider.loadFileRepresentation(for: .image, openInPlace: false) { url, _, _ in
        continuation.resume(returning: url.flatMap { try? readCopy(from: $0) })
      }
    }
  }

  static func hasReadableDimensions(_ source: CGImageSource) -> Bool {
    guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let width = properties[kCGImagePropertyPixelWidth] as? Int,
      let height = properties[kCGImagePropertyPixelHeight] as? Int
    else { return false }
    return width > 0 && height > 0 && width <= 12_000 && height <= 12_000
      && width * height <= 40_000_000
  }
}

struct ImageTextSession: Identifiable, Sendable {
  let id: UUID
  let assets: [ImageTextAsset]

  init(id: UUID = UUID(), assets: [ImageTextAsset]) {
    self.id = id
    self.assets = assets
  }
}

@MainActor
@Observable
final class ImageTextSessionStore {
  private var sessions: [UUID: ImageTextSession]

  init(session: ImageTextSession? = nil) {
    sessions = session.map { [$0.id: $0] } ?? [:]
  }

  func insert(_ session: ImageTextSession) { sessions[session.id] = session }
  func session(_ id: UUID) -> ImageTextSession? { sessions[id] }
  func remove(_ id: UUID) { sessions[id] = nil }
}

enum ImageTextAssetError: Error {
  case unsupportedSize
  case unsupportedDimensions
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

  var extent: CGFloat { isVertical ? boundingBox.height : boundingBox.width }
  var thickness: CGFloat { isVertical ? boundingBox.width : boundingBox.height }
  var endsSentence: Bool { text.last.map { "。．！？!?」』".contains($0) } ?? false }

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
