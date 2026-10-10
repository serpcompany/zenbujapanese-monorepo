import XCTest

#if os(macOS)
  import AppKit
#else
  import UIKit
#endif

enum TestDevice {
  enum Kind {
    case phone
    case pad
    case mac

    var name: String {
      switch self {
      case .phone: "iPhone"
      case .pad: "iPad"
      case .mac: "Mac"
      }
    }
  }

  @MainActor static var kind: Kind {
    #if os(macOS)
      .mac
    #else
      UIDevice.current.userInterfaceIdiom == .pad ? .pad : .phone
    #endif
  }

  static var largestTextArguments: [String] {
    #if os(macOS)
      []
    #else
      ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
    #endif
  }

  @MainActor static func turn(landscape: Bool) {
    #if os(iOS)
      let orientation: UIDeviceOrientation = landscape ? .landscapeLeft : .portrait
      if XCUIDevice.shared.orientation != orientation {
        XCUIDevice.shared.orientation = orientation
      }
    #endif
  }

  @MainActor static func leaveAndReturn(to app: XCUIApplication) {
    #if os(macOS)
      app.typeKey("w", modifierFlags: .command)
      app.activate()
      app.typeKey("n", modifierFlags: .command)
      app.typeKey("2", modifierFlags: .command)
    #else
      XCUIDevice.shared.press(.home)
      app.activate()
    #endif
  }

  @MainActor static func copyImage(_ data: Data) {
    #if os(macOS)
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setData(data, forType: .png)
    #endif
  }
}
