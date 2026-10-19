import Foundation

#if os(iOS)
  import UIKit
#endif

enum ShareSheetHarness {
  @MainActor
  static func open(_ environment: [String: String] = ProcessInfo.processInfo.environment) {
    #if DEBUG && os(iOS)
      let items: [Any] =
        environment[LaunchHarness.shareTextKey].map { [$0] }
        ?? environment[LaunchHarness.shareImageKey].map { [URL(filePath: $0)] } ?? []
      let windows = UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
      guard !items.isEmpty,
        var presenter = (windows.first(where: \.isKeyWindow) ?? windows.first)?.rootViewController
      else { return }
      while let presented = presenter.presentedViewController { presenter = presented }
      let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
      sheet.popoverPresentationController?.sourceView = presenter.view
      sheet.popoverPresentationController?.sourceRect = CGRect(
        x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
      presenter.present(sheet, animated: true)
    #endif
  }
}
