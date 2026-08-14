import CoreGraphics
import Foundation
import Vision

extension HandwritingRecognitionClient {
  static let live = HandwritingRecognitionClient { sample in
    if let offlineCandidates = try? await OfflineHandwritingRecognizer.shared.candidates(for: sample),
       !offlineCandidates.isEmpty {
      return offlineCandidates
    }

    let operation = VisionHandwritingRecognitionOperation(sample: sample)
    let task = Task.detached(priority: .userInitiated) { try operation.run() }
    return try await withTaskCancellationHandler {
      try await task.value
    } onCancel: {
      operation.cancel()
      task.cancel()
    }
  }
}

private final class VisionHandwritingRecognitionOperation: @unchecked Sendable {
  private let sample: HandwritingSample
  private let lock = NSLock()
  private var activeRequest: VNRequest?
  private var isCancelled = false

  init(sample: HandwritingSample) { self.sample = sample }

  func cancel() {
    lock.withLock {
      isCancelled = true
      activeRequest?.cancel()
    }
  }

  func run() throws -> [HandwritingCandidate] {
    try checkCancellation()
    guard let image = HandwritingImageRenderer.image(for: sample) else { return [] }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["ja-JP"]
    request.usesLanguageCorrection = false
    request.minimumTextHeight = 0.1
    try lock.withLock {
      guard !isCancelled else { throw CancellationError() }
      activeRequest = request
    }
    defer { lock.withLock { activeRequest = nil } }
    try VNImageRequestHandler(cgImage: image).perform([request])
    try checkCancellation()

    var seen = Set<String>()
    return (request.results ?? []).flatMap { $0.topCandidates(5) }.compactMap { candidate in
      let value = SearchQuery(candidate.string).value
      guard SearchQuery(value).isJapaneseOnly, seen.insert(value).inserted else { return nil }
      return HandwritingCandidate(value: value)
    }
  }

  private func checkCancellation() throws {
    try lock.withLock {
      guard !isCancelled, !Task.isCancelled else { throw CancellationError() }
    }
  }
}

private enum HandwritingImageRenderer {
  static func image(for sample: HandwritingSample) -> CGImage? {
    let dimension = 512
    guard let context = CGContext(
      data: nil,
      width: dimension,
      height: dimension,
      bitsPerComponent: 8,
      bytesPerRow: dimension,
      space: CGColorSpaceCreateDeviceGray(),
      bitmapInfo: CGImageAlphaInfo.none.rawValue
    ) else { return nil }

    context.setFillColor(gray: 1, alpha: 1)
    context.fill(CGRect(x: 0, y: 0, width: dimension, height: dimension))
    context.setStrokeColor(gray: 0, alpha: 1)
    context.setLineWidth(24)
    context.setLineCap(.round)
    context.setLineJoin(.round)

    for stroke in sample.strokes where !stroke.isEmpty {
      let points = stroke.map {
        CGPoint(x: $0.x * Double(dimension), y: (1 - $0.y) * Double(dimension))
      }
      context.beginPath()
      context.move(to: points[0])
      for point in points.dropFirst() { context.addLine(to: point) }
      context.strokePath()
    }
    return context.makeImage()
  }
}
