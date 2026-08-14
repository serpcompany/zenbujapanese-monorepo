#if DEBUG
import SwiftUI
import UIKit

struct ImageFileExporter: UIViewControllerRepresentable {
  let urls: [URL]
  let completion: () -> Void

  func makeCoordinator() -> Coordinator { Coordinator(completion: completion) }

  func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
    let picker = UIDocumentPickerViewController(forExporting: urls, asCopy: true)
    picker.delegate = context.coordinator
    return picker
  }

  func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}

  final class Coordinator: NSObject, UIDocumentPickerDelegate {
    let completion: () -> Void

    init(completion: @escaping () -> Void) { self.completion = completion }

    func documentPicker(
      _ controller: UIDocumentPickerViewController,
      didPickDocumentsAt urls: [URL]
    ) {
      completion()
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
      completion()
    }
  }
}
#endif
