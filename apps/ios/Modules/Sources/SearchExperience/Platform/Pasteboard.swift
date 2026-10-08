import Foundation

#if os(macOS)
  import AppKit
#else
  import UIKit
#endif

@MainActor
enum Pasteboard {
  static func copy(_ text: String) {
    #if os(macOS)
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(text, forType: .string)
    #else
      UIPasteboard.general.string = text
    #endif
  }

  #if os(macOS)
    static let offersImagePaste = true

    static var imageFile: URL? {
      let options: [NSPasteboard.ReadingOptionKey: Any] = [
        .urlReadingFileURLsOnly: true,
        .urlReadingContentsConformToTypes: ["public.image"],
      ]
      return NSPasteboard.general.readObjects(forClasses: [NSURL.self], options: options)?
        .first as? URL
    }

    static var imageData: Data? {
      NSPasteboard.general.data(forType: .png) ?? NSPasteboard.general.data(forType: .tiff)
    }
  #else
    static let offersImagePaste = false
    static let imageFile: URL? = nil
    static let imageData: Data? = nil
  #endif
}
