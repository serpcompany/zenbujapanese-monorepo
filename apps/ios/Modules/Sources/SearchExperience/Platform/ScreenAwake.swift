import Foundation

#if os(iOS)
  import UIKit
#endif

@MainActor
enum ScreenAwake {
  #if os(macOS)
    private static var activity: (any NSObjectProtocol)?
  #endif

  static func keepAwake(_ isAwake: Bool) {
    #if os(macOS)
      if isAwake, activity == nil {
        activity = ProcessInfo.processInfo.beginActivity(
          options: [.idleDisplaySleepDisabled, .userInitiated],
          reason: "Translate is listening")
      } else if !isAwake, let current = activity {
        ProcessInfo.processInfo.endActivity(current)
        activity = nil
      }
    #else
      UIApplication.shared.isIdleTimerDisabled = isAwake
    #endif
  }
}
