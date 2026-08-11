import Foundation
import ImageIO
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
      let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
      let byteCount = attributes[.size] as? Int ?? 0
      guard byteCount > 0, byteCount <= 12 * 1_024 * 1_024 else {
        throw ImageTextAssetError.unsupportedSize
      }
      let data = try Data(contentsOf: url)
      guard let source = CGImageSourceCreateWithData(data as CFData, nil),
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
        let width = properties[kCGImagePropertyPixelWidth] as? Int,
        let height = properties[kCGImagePropertyPixelHeight] as? Int,
        width > 0, height > 0, width <= 12_000, height <= 12_000,
        width * height <= 40_000_000
      else {
        throw ImageTextAssetError.unsupportedDimensions
      }
      try Task.checkCancellation()
      return ImageTextAsset(name: url.lastPathComponent, data: data)
    }
    return try await withTaskCancellationHandler {
      try await worker.value
    } onCancel: {
      worker.cancel()
    }
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
