import SwiftUI
import UniformTypeIdentifiers
import UIKit

struct ImageFilePicker: UIViewControllerRepresentable {
  let initialDirectory: URL?
  let completion: (Result<[URL], Error>) -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(completion: completion)
  }

  func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
    let picker = UIDocumentPickerViewController(
      forOpeningContentTypes: [UTType.image],
      asCopy: true
    )
    picker.allowsMultipleSelection = true
    picker.delegate = context.coordinator
    if let initialDirectory { picker.directoryURL = initialDirectory }
    return picker
  }

  func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}

  final class Coordinator: NSObject, UIDocumentPickerDelegate {
    let completion: (Result<[URL], Error>) -> Void

    init(completion: @escaping (Result<[URL], Error>) -> Void) {
      self.completion = completion
    }

    func documentPicker(
      _ controller: UIDocumentPickerViewController,
      didPickDocumentsAt urls: [URL]
    ) {
      completion(.success(urls))
    }
  }
}
