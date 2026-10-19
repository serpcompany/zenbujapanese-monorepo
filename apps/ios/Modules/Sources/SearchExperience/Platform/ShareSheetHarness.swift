import Foundation

#if os(iOS)
  import SwiftUI
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
      if environment[LaunchHarness.shareCardInAppKey] == "1" {
        presenter.present(cardInTheApp(sharing: items), animated: true)
        return
      }
      let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
      sheet.popoverPresentationController?.sourceView = presenter.view
      sheet.popoverPresentationController?.sourceRect = CGRect(
        x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
      presenter.present(sheet, animated: true)
    #endif
  }

  #if DEBUG && os(iOS)
    @MainActor
    private static func cardInTheApp(sharing items: [Any]) -> UIViewController {
      let request = SharedItemRequest()
      let tokenizer = URL.cachesDirectory.appending(path: "Tokenizer", directoryHint: .isDirectory)
      let card = UIHostingController(
        rootView: ShareCardScene(
          request: request, reader: .onDevice(unpackingTokenizerInto: tokenizer),
          stores: .sharedWithTheApp(), done: {}))
      card.modalPresentationStyle = .fullScreen
      let attachments = items.compactMap { item -> NSItemProvider? in
        if let url = item as? URL { return NSItemProvider(contentsOf: url) }
        return (item as? String).map { NSItemProvider(object: $0 as NSString) }
      }
      Task { request.item = await SharedItemReading.first(in: attachments) }
      return card
    }
  #endif
}
