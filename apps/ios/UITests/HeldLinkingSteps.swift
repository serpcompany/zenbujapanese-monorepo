import XCTest
import notify

extension ZenbuUITestCase {
  static let holdLinking = ["ZENBU_HOLD_LINKING": "1"]
  private static let letGoNotice = "com.zenbujapanese.dictionary.uitests.let-linking-go"
  private static let letGoRegistration: Int32 = {
    var registration: Int32 = 0
    notify_register_check(letGoNotice, &registration)
    return registration
  }()

  func letLinkingGo(until element: XCUIElement, in app: XCUIApplication) {
    waitUntil("\(element) to exist as held answers are let go") {
      if element.exists { return true }
      letLinkingGo(heldBefore: .now)
      return false
    }
  }

  func letLinkingGo(heldBefore cut: Date) {
    notify_set_state(Self.letGoRegistration, UInt64(cut.timeIntervalSince1970 * 1_000_000))
    notify_post(Self.letGoNotice)
  }
}
