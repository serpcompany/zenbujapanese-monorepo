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

  init(
    id: Int,
    text: String,
    boundingBox: CGRect,
    confidence: Float,
    characterBoxes: [CGRect] = []
  ) {
    self.id = id
    self.text = text
    self.boundingBox = boundingBox
    self.confidence = confidence
    self.characterBoxes = characterBoxes
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
    let handler = ImageRequestHandler(image, orientation: imageOrientation(source))

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
      return RecognizedImageTextObservation(
        id: index,
        text: candidate.string,
        boundingBox: observation.boundingBox.cgRect,
        confidence: candidate.confidence,
        characterBoxes: characterBoxes(candidate)
      )
    }
  }

  private static func imageOrientation(_ source: CGImageSource) -> CGImagePropertyOrientation {
    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    let rawValue = (properties?[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1
    return CGImagePropertyOrientation(rawValue: rawValue) ?? .up
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
