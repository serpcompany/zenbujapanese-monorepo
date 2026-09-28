import CoreGraphics
import Foundation
import ImageIO
import Vision

struct RecognizedImageTextObservation: Hashable, Identifiable, Sendable {
  let id: Int
  let text: String
  let boundingBox: CGRect
  let confidence: Float
  let characterBoxes: [CGRect]
  /// Whether the line runs top to bottom, judged in image pixels rather than normalized
  /// coordinates so a wide or tall image doesn't skew the result.
  let isVertical: Bool

  init(
    id: Int,
    text: String,
    boundingBox: CGRect,
    confidence: Float,
    characterBoxes: [CGRect] = [],
    isVertical: Bool = false
  ) {
    self.id = id
    self.text = text
    self.boundingBox = boundingBox
    self.confidence = confidence
    self.characterBoxes = characterBoxes
    self.isVertical = isVertical
  }
}

struct ImageTextRecognitionClient: Sendable {
  var recognize: @Sendable (ImageTextAsset) async throws -> [RecognizedImageTextObservation]

  static let live = ImageTextRecognitionClient { asset in
    let task = Task.detached(priority: .userInitiated) {
      try await VisionTextRecognizer.recognize(asset)
    }
    return try await withTaskCancellationHandler {
      try await task.value
    } onCancel: {
      task.cancel()
    }
  }
}

/// Uses the Swift Vision `RecognizeTextRequest`, which reads vertical Japanese columns
/// right to left. `VNRecognizeTextRequest` returns nothing for vertical Japanese.
private enum VisionTextRecognizer {
  static func recognize(_ asset: ImageTextAsset) async throws -> [RecognizedImageTextObservation] {
    try Task.checkCancellation()
    guard let source = CGImageSourceCreateWithData(asset.data as CFData, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else {
      throw ImageTextRecognitionError.invalidImage
    }
    let orientation = imageOrientation(source)
    let handler = ImageRequestHandler(image, orientation: orientation)
    let pixelSize = orientedSize(image, orientation: orientation)

    var results = try await handler.perform(
      request(languages: ["ja-JP", "en-US"], languageCorrection: true))
    if !results.containsJapaneseText {
      try Task.checkCancellation()
      let fallback = try await handler.perform(
        request(languages: ["ja-JP"], languageCorrection: false))
      if !fallback.isEmpty { results = fallback }
    }
    try Task.checkCancellation()
    return results.enumerated().compactMap { index, observation in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      let boxes = characterBoxes(candidate)
      return RecognizedImageTextObservation(
        id: index,
        text: candidate.string,
        boundingBox: observation.boundingBox.cgRect,
        confidence: candidate.confidence,
        characterBoxes: boxes,
        isVertical: isVertical(observation.boundingBox.cgRect, characterBoxes: boxes, in: pixelSize)
      )
    }
  }

  private static func imageOrientation(_ source: CGImageSource) -> CGImagePropertyOrientation {
    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    let rawValue = (properties?[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1
    return CGImagePropertyOrientation(rawValue: rawValue) ?? .up
  }

  private static func orientedSize(
    _ image: CGImage,
    orientation: CGImagePropertyOrientation
  ) -> CGSize {
    switch orientation {
    case .left, .leftMirrored, .right, .rightMirrored:
      CGSize(width: image.height, height: image.width)
    default:
      CGSize(width: image.width, height: image.height)
    }
  }

  /// A line is vertical when its characters advance downward. Single-character lines fall back
  /// to the shape of the line's box.
  private static func isVertical(
    _ boundingBox: CGRect,
    characterBoxes: [CGRect],
    in size: CGSize
  ) -> Bool {
    let boxes = characterBoxes.filter { !$0.isNull && !$0.isEmpty }
    if let first = boxes.first, let last = boxes.last, boxes.count > 1 {
      let dx = abs(last.midX - first.midX) * size.width
      let dy = abs(last.midY - first.midY) * size.height
      return dy > dx
    }
    return boundingBox.height * size.height > boundingBox.width * size.width * 1.35
  }

  private static func characterBoxes(_ candidate: RecognizedText) -> [CGRect] {
    var boxes: [CGRect] = []
    var start = candidate.string.startIndex
    while start < candidate.string.endIndex {
      let end = candidate.string.index(after: start)
      boxes.append(candidate.boundingBox(for: start ..< end)?.boundingBox.cgRect ?? .null)
      start = end
    }
    return boxes
  }

  private static func request(languages: [String], languageCorrection: Bool)
    -> RecognizeTextRequest
  {
    var request = RecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = languages.map { Locale.Language(identifier: $0) }
    request.usesLanguageCorrection = languageCorrection
    request.minimumTextHeightFraction = languageCorrection ? 0.01 : 0.005
    return request
  }
}

private extension [RecognizedTextObservation] {
  var containsJapaneseText: Bool {
    contains { observation in
      observation.topCandidates(1).first?.string.contains(where: \.isJapaneseText) == true
    }
  }
}

private extension Character {
  var isJapaneseText: Bool {
    unicodeScalars.contains {
      (0x3040...0x30FF).contains(Int($0.value)) || (0x3400...0x9FFF).contains(Int($0.value))
    }
  }
}

enum ImageTextRecognitionError: Error {
  case invalidImage
}
