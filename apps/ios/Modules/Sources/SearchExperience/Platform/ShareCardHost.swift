#if os(iOS)
  import SwiftUI
  import UIKit

  open class ShareCardViewController: UIViewController {
    private let request = SharedItemRequest()

    override open func viewDidLoad() {
      super.viewDidLoad()
      isModalInPresentation = true
      let tokenizer = URL.cachesDirectory.appending(path: "Tokenizer", directoryHint: .isDirectory)
      let scene = ShareCardScene(
        request: request, reader: .onDevice(unpackingTokenizerInto: tokenizer),
        stores: .sharedWithTheApp()
      ) { [weak self] in
        ShareCardMemory.note("done")
        self?.extensionContext?.completeRequest(returningItems: nil)
      }
      let host = UIHostingController(rootView: scene)
      addChild(host)
      host.view.frame = view.bounds
      host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      view.addSubview(host.view)
      host.didMove(toParent: self)
      let attachments = (extensionContext?.inputItems ?? [])
        .compactMap { $0 as? NSExtensionItem }
        .flatMap { $0.attachments ?? [] }
      Task { [request] in
        request.item = await SharedItemReading.first(in: attachments)
      }
    }
  }
#endif
