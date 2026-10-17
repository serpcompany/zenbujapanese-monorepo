import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

enum ImageCoding {
  static func image(from data: Data) -> CGImage? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      let size = pixelSize(of: source)
    else { return nil }
    return thumbnail(from: source, maxPixelSize: max(size.width, size.height))
  }

  static func pixelSize(of source: CGImageSource) -> (width: Int, height: Int)? {
    guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let width = properties[kCGImagePropertyPixelWidth] as? Int,
      let height = properties[kCGImagePropertyPixelHeight] as? Int
    else { return nil }
    return (width, height)
  }

  static func orientation(of source: CGImageSource) -> CGImagePropertyOrientation {
    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    let rawValue = (properties?[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1
    return CGImagePropertyOrientation(rawValue: rawValue) ?? .up
  }

  static func orientedSize(_ image: CGImage, orientation: CGImagePropertyOrientation) -> CGSize {
    switch orientation {
    case .left, .leftMirrored, .right, .rightMirrored:
      CGSize(width: image.height, height: image.width)
    default:
      CGSize(width: image.width, height: image.height)
    }
  }

  static func thumbnail(from source: CGImageSource, maxPixelSize: Int) -> CGImage? {
    CGImageSourceCreateThumbnailAtIndex(
      source, 0,
      [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        kCGImageSourceShouldCacheImmediately: true,
      ] as CFDictionary)
  }

  static func jpegData(_ image: CGImage, quality: Double) -> Data? {
    encode(image, as: .jpeg, options: [kCGImageDestinationLossyCompressionQuality: quality])
  }

  static func pngData(_ image: CGImage) -> Data? {
    encode(image, as: .png, options: [:])
  }

  static func drawing(width: Int, height: Int, _ draw: (CGContext) -> Void) -> CGImage? {
    guard width > 0, height > 0,
      let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
      let context = CGContext(
        data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
        space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { return nil }
    draw(context)
    return context.makeImage()
  }

  private static func encode(
    _ image: CGImage, as type: UTType, options: [CFString: Any]
  ) -> Data? {
    let data = NSMutableData()
    guard
      let destination = CGImageDestinationCreateWithData(
        data as CFMutableData, type.identifier as CFString, 1, nil)
    else { return nil }
    CGImageDestinationAddImage(destination, image, options as CFDictionary)
    guard CGImageDestinationFinalize(destination) else { return nil }
    return data as Data
  }
}
