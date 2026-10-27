import XCTest
import notify

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

  static let settingsWindow = "com_apple_SwiftUI_Settings_window"

  static var launchArguments: [String] {
    #if os(macOS)
      ["-ApplePersistenceIgnoreState", "YES"]
    #else
      []
    #endif
  }

  static var largestTextArguments: [String] {
    #if os(macOS)
      []
    #else
      ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
    #endif
  }

  static var audits: [(type: XCUIAccessibilityAuditType, kind: AuditKind)] {
    let everywhere: [(XCUIAccessibilityAuditType, AuditKind)] = [
      (.contrast, .contrast), (.elementDetection, .elementDetection), (.hitRegion, .hitRegion),
      (.sufficientElementDescription, .elementDescription),
    ]
    #if os(macOS)
      return everywhere + [(.action, .action), (.parentChild, .parentChild)]
    #else
      return everywhere + [(.dynamicType, .dynamicType), (.textClipped, .textClipped), (.trait, .trait)]
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

  @MainActor static func leave(_ app: XCUIApplication) {
    #if os(macOS)
      app.typeKey("w", modifierFlags: .command)
    #else
      XCUIDevice.shared.press(.home)
    #endif
  }

  @MainActor static func quit(_ app: XCUIApplication) {
    #if os(macOS)
      app.typeKey("q", modifierFlags: .command)
    #else
      XCUIDevice.shared.press(.home)
    #endif
  }

  @MainActor static func comeBack(to app: XCUIApplication) {
    app.activate()
    #if os(macOS)
      app.typeKey("n", modifierFlags: .command)
      app.typeKey("2", modifierFlags: .command)
    #endif
  }

  static let openLinkNotice = "com.zenbujapanese.dictionary.uitests.open-link"

  static func linkEnvironment(_ link: URL) -> [String: String] {
    #if os(macOS)
      ["ZENBU_OPEN_LINK": link.absoluteString]
    #else
      [:]
    #endif
  }

  @MainActor static func open(_ link: URL) {
    #if os(macOS)
      notify_post(openLinkNotice)
    #else
      XCUIDevice.shared.system.open(link)
    #endif
  }

  @MainActor static func movePointerAway(in app: XCUIApplication) {
    #if os(macOS)
      app.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.95)).hover()
    #endif
  }

  @MainActor static func selectAllText(in field: XCUIElement) {
    #if os(macOS)
      field.typeKey("a", modifierFlags: .command)
    #else
      field.tap(withNumberOfTaps: 3, numberOfTouches: 1)
    #endif
  }

  @MainActor static func paste(_ text: String, into field: XCUIElement) {
    #if os(macOS)
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(text, forType: .string)
      field.typeKey("v", modifierFlags: .command)
    #endif
  }

  @MainActor static func copyImage(_ data: Data) {
    #if os(macOS)
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setData(data, forType: .png)
    #endif
  }
}
