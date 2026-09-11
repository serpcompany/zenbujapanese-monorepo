import UIKit

@MainActor
struct ImageTextClipboardClient {
  var copy: (String) -> Void

  static let live = ImageTextClipboardClient { text in
    UIPasteboard.general.string = text
  }
}
