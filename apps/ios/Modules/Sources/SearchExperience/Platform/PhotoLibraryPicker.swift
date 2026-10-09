import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

#if os(macOS)
  struct ImagePhotoLibraryPicker: NSViewControllerRepresentable {
    let completion: ImagePickerCompletion

    func makeCoordinator() -> PhotoLibraryPickerCoordinator {
      PhotoLibraryPickerCoordinator(completion: completion)
    }

    func makeNSViewController(context: Context) -> PHPickerViewController {
      context.coordinator.makePicker()
    }

    func updateNSViewController(_ nsViewController: PHPickerViewController, context: Context) {}

    func sizeThatFits(
      _ proposal: ProposedViewSize, nsViewController: PHPickerViewController, context: Context
    ) -> CGSize? {
      AppWindow.photoPickerSize
    }
  }
#else
  struct ImagePhotoLibraryPicker: UIViewControllerRepresentable {
    let completion: ImagePickerCompletion

    func makeCoordinator() -> PhotoLibraryPickerCoordinator {
      PhotoLibraryPickerCoordinator(completion: completion)
    }

    func makeUIViewController(context: Context) -> PHPickerViewController {
      context.coordinator.makePicker()
    }

    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}
  }
#endif

final class PhotoLibraryPickerCoordinator: ImagePickerCoordinator, PHPickerViewControllerDelegate {
  func makePicker() -> PHPickerViewController {
    var configuration = PHPickerConfiguration()
    configuration.filter = .images
    configuration.selectionLimit = 1
    let picker = PHPickerViewController(configuration: configuration)
    picker.delegate = self
    return picker
  }

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    guard let provider = results.first?.itemProvider else {
      completion(.success(nil))
      return
    }
    let completion = completion
    provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { url, _ in
      let asset = url.flatMap {
        ImageTextAsset(photoLibraryImageAt: $0, name: $0.lastPathComponent)
      }
      Task { @MainActor in
        completion(asset.map { .success($0) } ?? .failure(ImageSourcePickerError.unreadableImage))
      }
    }
  }
}
