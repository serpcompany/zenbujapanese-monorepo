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
    let operation = VisionTextRecognitionOperation(asset: asset)
    let task = Task.detached(priority: .userInitiated) { try operation.run() }
    return try await withTaskCancellationHandler {
      try await task.value
    } onCancel: {
      operation.cancel()
      task.cancel()
    }
  }
}

private final class VisionTextRecognitionOperation: @unchecked Sendable {
  private let asset: ImageTextAsset
  private let lock = NSLock()
  private var activeRequest: VNRequest?
  private var isCancelled = false

  init(asset: ImageTextAsset) {
    self.asset = asset
  }

  func cancel() {
    lock.withLock {
      isCancelled = true
      activeRequest?.cancel()
    }
  }

  func run() throws -> [RecognizedImageTextObservation] {
    try checkCancellation()
    guard let source = CGImageSourceCreateWithData(asset.data as CFData, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else {
      throw ImageTextRecognitionError.invalidImage
    }
    let orientation = imageOrientation(source)

    let primary = request(languages: ["ja-JP", "en-US"], languageCorrection: true)
    var results = try perform(primary, image: image, orientation: orientation)
    if !results.containsJapaneseText {
      let japaneseOnly = request(languages: ["ja-JP"], languageCorrection: false)
      let fallback = try perform(japaneseOnly, image: image, orientation: orientation)
      if !fallback.isEmpty { results = fallback }
    }
    try checkCancellation()
    return results.enumerated().compactMap { index, observation in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      return RecognizedImageTextObservation(
        id: index,
        text: candidate.string,
        boundingBox: observation.boundingBox,
        confidence: candidate.confidence,
        characterBoxes: characterBoxes(candidate)
      )
    }
  }

  private func imageOrientation(_ source: CGImageSource) -> CGImagePropertyOrientation {
    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    let rawValue = (properties?[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1
    return CGImagePropertyOrientation(rawValue: rawValue) ?? .up
  }

  private func characterBoxes(_ candidate: VNRecognizedText) -> [CGRect] {
    var boxes: [CGRect] = []
    var start = candidate.string.startIndex
    while start < candidate.string.endIndex {
      let end = candidate.string.index(after: start)
      let rectangle = try? candidate.boundingBox(for: start ..< end)
      boxes.append(rectangle?.boundingBox ?? .null)
      start = end
    }
    return boxes
  }

  private func request(languages: [String], languageCorrection: Bool) -> VNRecognizeTextRequest {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = languages
    request.usesLanguageCorrection = languageCorrection
    request.minimumTextHeight = languageCorrection ? 0.01 : 0.005
    return request
  }

  private func perform(
    _ request: VNRecognizeTextRequest,
    image: CGImage,
    orientation: CGImagePropertyOrientation
  ) throws -> [VNRecognizedTextObservation] {
    try lock.withLock {
      guard !isCancelled else { throw CancellationError() }
      activeRequest = request
    }
    defer { lock.withLock { activeRequest = nil } }
    try VNImageRequestHandler(cgImage: image, orientation: orientation).perform([request])
    try checkCancellation()
    return request.results ?? []
  }

  private func checkCancellation() throws {
    try lock.withLock {
      guard !isCancelled, !Task.isCancelled else { throw CancellationError() }
    }
  }
}

private extension [VNRecognizedTextObservation] {
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
