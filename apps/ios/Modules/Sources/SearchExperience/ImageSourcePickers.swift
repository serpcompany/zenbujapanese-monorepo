import Foundation
import ImageIO

extension ImageTextAsset {
  init?(photoLibraryImageAt url: URL, name: String) {
    guard
      let source = CGImageSourceCreateWithURL(
        url as CFURL,
        [kCGImageSourceShouldCache: false] as CFDictionary
      ),
      let data = Self.normalizedPhotoData(from: source)
    else { return nil }
    self.init(name: name, data: data)
  }

  init?(pastedImageData data: Data, name: String) {
    guard
      let source = CGImageSourceCreateWithData(
        data as CFData,
        [kCGImageSourceShouldCache: false] as CFDictionary
      ),
      Self.hasReadableDimensions(source),
      let normalized = Self.normalizedPhotoData(from: source)
    else { return nil }
    self.init(name: name, data: normalized)
  }

  private static func normalizedPhotoData(from source: CGImageSource) -> Data? {
    guard let image = ImageCoding.thumbnail(from: source, maxPixelSize: 4_096) else { return nil }
    return ImageCoding.jpegData(image, quality: 0.9)
  }
}

enum ImageSourcePickerError: Error {
  case unreadableImage
}
