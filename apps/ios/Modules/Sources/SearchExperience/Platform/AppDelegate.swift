import SwiftUI

#if os(macOS)
  import AppKit

  public typealias ApplicationDelegateAdaptor = NSApplicationDelegateAdaptor<ApplicationDelegate>

  public final class ApplicationDelegate: NSObject, NSApplicationDelegate {
    public func applicationShouldTerminate(_ sender: NSApplication)
      -> NSApplication.TerminateReply
    {
      Task {
        await AppLifecycle.finishSaving()
        sender.reply(toApplicationShouldTerminate: true)
      }
      return .terminateLater
    }
  }
#else
  import UIKit

  public typealias ApplicationDelegateAdaptor = UIApplicationDelegateAdaptor<ApplicationDelegate>

  public final class ApplicationDelegate: NSObject, UIApplicationDelegate {}
#endif
