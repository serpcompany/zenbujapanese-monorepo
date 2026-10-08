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
      guard let decoded = NSImage(data: data) else { return nil }
      image = Image(nsImage: decoded)
    #else
      guard let decoded = UIImage(data: data) else { return nil }
      image = Image(uiImage: decoded)
    #endif
    size = decoded.size
  }
}

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
