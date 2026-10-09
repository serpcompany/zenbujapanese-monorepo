import Foundation
import UniformTypeIdentifiers

#if os(macOS)
  import AppKit
#else
  import UIKit
#endif

enum PastedImage: Sendable {
  case file(URL)
  case data(Data)
}

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

    static var image: PastedImage? {
      let board = NSPasteboard.general
      let files =
        board.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true])
        as? [URL] ?? []
      guard files.isEmpty else {
        return files.first { UTType(filenameExtension: $0.pathExtension)?.conforms(to: .image) == true }
          .map(PastedImage.file)
      }
      return (board.data(forType: .png) ?? board.data(forType: .tiff)).map(PastedImage.data)
    }
  #else
    static let offersImagePaste = false
    static let image: PastedImage? = nil
  #endif
}
