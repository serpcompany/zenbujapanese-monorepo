import Foundation

@MainActor
struct ImageTextClipboardClient {
  var copy: (String) -> Void

  static let live = ImageTextClipboardClient { text in
    Pasteboard.copy(text)
  }
}
