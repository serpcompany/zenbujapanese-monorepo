#if DEBUG
import CoreGraphics
import Foundation

enum ImageTextRecognitionFixture {
  static func clientFromProcessArguments(live: ImageTextRecognitionClient) -> ImageTextRecognitionClient? {
    let arguments = ProcessInfo.processInfo.arguments
    let injectsSparse = arguments.contains("-InjectSparseImageTextRecognition")
    let injectsVertical = arguments.contains("-InjectVerticalImageTextRecognition")
    let injectsUnlinked = arguments.contains("-InjectUnlinkedImageTextRecognition")
    guard injectsSparse || injectsVertical || injectsUnlinked else {
      return nil
    }
    return ImageTextRecognitionClient { asset in
      if injectsSparse, asset.name.contains("sparse") {
        return [
          RecognizedImageTextObservation(
            id: 0,
            text: "静",
            boundingBox: CGRect(x: 0.31, y: 0.25, width: 0.38, height: 0.5),
            confidence: 1
          )
        ]
      }
      if injectsUnlinked, asset.name.contains("empty") {
        return [
          RecognizedImageTextObservation(
            id: 0,
            text: "龘龘",
            boundingBox: CGRect(x: 0.3, y: 0.4, width: 0.4, height: 0.2),
            confidence: 1
          )
        ]
      }
      if injectsVertical, asset.name.contains("vertical") {
        return [
          RecognizedImageTextObservation(id: 0, text: "春の朝、静かな庭を", boundingBox: CGRect(x: 0.72, y: 0.2, width: 0.16, height: 0.66), confidence: 1),
          RecognizedImageTextObservation(id: 1, text: "蝶々が飛んでいる。", boundingBox: CGRect(x: 0.52, y: 0.25, width: 0.16, height: 0.61), confidence: 1),
          RecognizedImageTextObservation(id: 2, text: "日本語", boundingBox: CGRect(x: 0.27, y: 0.48, width: 0.08, height: 0.30), confidence: 1),
          RecognizedImageTextObservation(id: 3, text: "を読む。", boundingBox: CGRect(x: 0.14, y: 0.38, width: 0.08, height: 0.40), confidence: 1),
        ]
      }
      return try await live.recognize(asset)
    }
  }
}
#endif
