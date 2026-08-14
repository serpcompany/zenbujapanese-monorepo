import CoreGraphics
import CoreML
import CoreVideo
import Foundation

/// Image-based recognition of a completed character drawing.
///
/// DaKanji receives only the rasterized final shape. Stroke order, stroke
/// direction, and the number of gestures used to construct the shape are not
/// model inputs.
actor OfflineHandwritingRecognizer {
  static let shared = OfflineHandwritingRecognizer()

  enum RecognitionError: Error {
    case modelUnavailable
    case drawingBufferUnavailable
    case probabilitiesUnavailable
  }

  private var cachedModel: MLModel?

  func candidates(
    for sample: HandwritingSample,
    limit: Int = 20
  ) throws -> [HandwritingCandidate] {
    guard !sample.strokes.isEmpty else { return [] }

    let model = try loadModel()
    let pixelBuffer = try Self.makePixelBuffer(for: sample)
    let input = try MLDictionaryFeatureProvider(
      dictionary: ["input_4": MLFeatureValue(pixelBuffer: pixelBuffer)]
    )
    let output = try model.prediction(from: input)
    guard let probabilities = output
      .featureValue(for: "classLabel_probs")?
      .dictionaryValue as? [String: NSNumber] else {
      throw RecognitionError.probabilitiesUnavailable
    }

    return probabilities
      .sorted { $0.value.doubleValue > $1.value.doubleValue }
      .prefix(limit)
      .map { HandwritingCandidate(value: $0.key) }
  }

  private func loadModel() throws -> MLModel {
    if let cachedModel { return cachedModel }
    guard let url = Bundle.module.url(
      forResource: "DaKanji",
      withExtension: "mlmodelc"
    ) else {
      throw RecognitionError.modelUnavailable
    }

    let configuration = MLModelConfiguration()
    configuration.computeUnits = .all
    let model = try MLModel(contentsOf: url, configuration: configuration)
    cachedModel = model
    return model
  }

  private static func makePixelBuffer(for sample: HandwritingSample) throws -> CVPixelBuffer {
    let dimension = 64
    var optionalBuffer: CVPixelBuffer?
    let attributes: [CFString: Any] = [
      kCVPixelBufferCGImageCompatibilityKey: true,
      kCVPixelBufferCGBitmapContextCompatibilityKey: true
    ]
    let status = CVPixelBufferCreate(
      kCFAllocatorDefault,
      dimension,
      dimension,
      kCVPixelFormatType_OneComponent8,
      attributes as CFDictionary,
      &optionalBuffer
    )
    guard status == kCVReturnSuccess, let pixelBuffer = optionalBuffer else {
      throw RecognitionError.drawingBufferUnavailable
    }

    CVPixelBufferLockBaseAddress(pixelBuffer, [])
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
    guard
      let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer),
      let context = CGContext(
        data: baseAddress,
        width: dimension,
        height: dimension,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
        space: CGColorSpaceCreateDeviceGray(),
        bitmapInfo: CGImageAlphaInfo.none.rawValue
      )
    else {
      throw RecognitionError.drawingBufferUnavailable
    }

    context.setFillColor(gray: 0, alpha: 1)
    context.fill(CGRect(x: 0, y: 0, width: dimension, height: dimension))
    context.translateBy(x: 0, y: CGFloat(dimension))
    context.scaleBy(x: 1, y: -1)
    context.setStrokeColor(gray: 1, alpha: 1)
    context.setLineCap(.round)
    context.setLineJoin(.round)
    context.setLineWidth(4.5)

    let strokes = sample.strokes.map { stroke in
      stroke.map { CGPoint(x: $0.x, y: $0.y) }
    }
    let points = strokes.flatMap { $0 }
    guard let first = points.first else { return pixelBuffer }
    let bounds = points.dropFirst().reduce(
      CGRect(origin: first, size: .zero)
    ) { partial, point in
      partial.union(CGRect(origin: point, size: .zero))
    }
    let contentWidth = max(bounds.width, 0.001)
    let contentHeight = max(bounds.height, 0.001)
    let scale = min(52 / contentWidth, 52 / contentHeight)
    let xOffset = (CGFloat(dimension) - contentWidth * scale) / 2 - bounds.minX * scale
    let yOffset = (CGFloat(dimension) - contentHeight * scale) / 2 - bounds.minY * scale

    for stroke in strokes where !stroke.isEmpty {
      let path = CGMutablePath()
      let start = stroke[0]
      path.move(to: CGPoint(
        x: start.x * scale + xOffset,
        y: start.y * scale + yOffset
      ))
      if stroke.count == 1 {
        path.addLine(to: CGPoint(
          x: start.x * scale + xOffset + 0.01,
          y: start.y * scale + yOffset + 0.01
        ))
      } else {
        for point in stroke.dropFirst() {
          path.addLine(to: CGPoint(
            x: point.x * scale + xOffset,
            y: point.y * scale + yOffset
          ))
        }
      }
      context.addPath(path)
      context.strokePath()
    }

    return pixelBuffer
  }
}
