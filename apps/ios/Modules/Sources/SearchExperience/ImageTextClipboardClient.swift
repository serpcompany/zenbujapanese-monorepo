import UIKit

@MainActor
struct ImageTextClipboardClient {
  var copy: (String) -> String?

  static let live = ImageTextClipboardClient { text in
    UIPasteboard.general.string = text
    return nil
  }

  #if DEBUG
    static func clientFromProcessArguments() -> ImageTextClipboardClient? {
      guard ProcessInfo.processInfo.arguments.contains("-RecordImageTextCopyRequests") else {
        return nil
      }
      return ImageTextClipboardClient(copy: { $0 })
    }
  #endif
}
