import ImageIO
import SwiftUI

#if os(macOS)
  import AppKit
#else
  import UIKit
#endif

struct DecodedImage {
  let image: Image
  let size: CGSize

  init?(data: Data) {
    #if os(macOS)
      guard let source = CGImageSourceCreateWithData(data as CFData, nil),
        let decoded = CGImageSourceCreateImageAtIndex(source, 0, nil)
      else { return nil }
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
      let exif = (properties?[kCGImagePropertyOrientation] as? UInt32)
        .flatMap(CGImagePropertyOrientation.init(rawValue:))
      let orientation = Image.Orientation(exif ?? .up)
      image = Image(decorative: decoded, scale: 1, orientation: orientation)
      let width = CGFloat(decoded.width)
      let height = CGFloat(decoded.height)
      size = orientation.isQuarterTurn
        ? CGSize(width: height, height: width) : CGSize(width: width, height: height)
    #else
      guard let decoded = UIImage(data: data) else { return nil }
      image = Image(uiImage: decoded)
      size = decoded.size
    #endif
  }
}

#if os(macOS)
  extension Image.Orientation {
    fileprivate init(_ exif: CGImagePropertyOrientation) {
      self =
        switch exif {
        case .up: .up
        case .upMirrored: .upMirrored
        case .down: .down
        case .downMirrored: .downMirrored
        case .left: .left
        case .leftMirrored: .leftMirrored
        case .right: .right
        case .rightMirrored: .rightMirrored
        }
    }

    fileprivate var isQuarterTurn: Bool {
      [.left, .leftMirrored, .right, .rightMirrored].contains(self)
    }
  }
#endif

extension Image {
  init?(imageData data: Data) {
    guard let decoded = DecodedImage(data: data) else { return nil }
    self = decoded.image
  }
}

enum AppIcon {
  @MainActor
  static var image: Image? {
    #if os(macOS)
      Image(nsImage: NSApplication.shared.applicationIconImage)
    #else
      guard
        let icons = Bundle.main.object(forInfoDictionaryKey: "CFBundleIcons") as? [String: Any],
        let primary = icons["CFBundlePrimaryIcon"] as? [String: Any]
      else { return nil }
      let names = (primary["CFBundleIconFiles"] as? [String] ?? []).reversed()
        + [primary["CFBundleIconName"] as? String].compactMap { $0 }
      return names.lazy.compactMap { UIImage(named: $0) }.first.map(Image.init(uiImage:))
    #endif
  }
}
