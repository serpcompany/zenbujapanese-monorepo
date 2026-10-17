import Foundation

#if os(macOS)
  import AppKit

  public typealias ShareActionScreen = NSViewController
#else
  import UIKit

  public typealias ShareActionScreen = UIViewController
#endif

open class ShareActionController: ShareActionScreen {
  open class var action: ShareAction? { nil }
  private var started = false

  #if os(macOS)
    open override func loadView() {
      view = NSView(frame: NSRect(x: 0, y: 0, width: 1, height: 1))
    }

    open override func viewDidAppear() {
      super.viewDidAppear()
      start()
    }
  #else
    open override func viewDidAppear(_ animated: Bool) {
      super.viewDidAppear(animated)
      start()
    }
  #endif

  private func start() {
    guard !started, let context = extensionContext else { return }
    started = true
    let items = context.inputItems.compactMap { $0 as? NSExtensionItem }
    let bundleID = Bundle.main.bundleIdentifier ?? ""
    Task { @MainActor in
      if let url = await Self.action?.appURL(for: items, extensionBundleID: bundleID) {
        await openApp(url)
      }
      context.completeRequest(returningItems: nil)
    }
  }

  private func openApp(_ url: URL) async {
    #if os(macOS)
      let app = Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent()
      _ = try? await NSWorkspace.shared.open(
        [url], withApplicationAt: app, configuration: NSWorkspace.OpenConfiguration())
    #else
      _ = await view.window?.windowScene?.open(url, options: nil)
    #endif
  }
}
