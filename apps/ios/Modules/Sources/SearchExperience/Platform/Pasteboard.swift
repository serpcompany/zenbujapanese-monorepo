import Foundation
import UniformTypeIdentifiers

#if os(macOS)
  import AppKit
#else
  import UIKit
#endif

enum PastedImage: Sendable {
  case files([URL])
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
    nonisolated static let offersImagePaste = true

    static var image: PastedImage? {
      let board = NSPasteboard.general
      let files =
        board.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true])
        as? [URL] ?? []
      guard files.isEmpty else {
        let images = files.filter {
          UTType(filenameExtension: $0.pathExtension)?.conforms(to: .image) == true
        }
        return images.isEmpty ? nil : .files(images)
      }
      let data =
        board.data(forType: .png) ?? board.data(forType: .tiff)
        ?? NSImage(pasteboard: board)?.tiffRepresentation
      return data.map(PastedImage.data)
    }
  #else
    nonisolated static let offersImagePaste = false
    static let image: PastedImage? = nil
  #endif
}
