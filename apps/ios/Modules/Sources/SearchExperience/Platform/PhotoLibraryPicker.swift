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
    configuration.selectionLimit = ImageTextSource.importLimit
    let picker = PHPickerViewController(configuration: configuration)
    picker.delegate = self
    return picker
  }

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    let providers = results.map(\.itemProvider)
    guard !providers.isEmpty else {
      completion(.success([]))
      return
    }
    Task {
      var assets: [ImageTextAsset] = []
      for provider in providers {
        if let asset = await Self.asset(from: provider) { assets.append(asset) }
      }
      completion(assets.isEmpty ? .failure(ImageSourcePickerError.unreadableImage) : .success(assets))
    }
  }

  private static func asset(from provider: NSItemProvider) async -> ImageTextAsset? {
    await withCheckedContinuation { continuation in
      provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { url, _ in
        continuation.resume(
          returning: url.flatMap {
            ImageTextAsset(photoLibraryImageAt: $0, name: $0.lastPathComponent)
          })
      }
    }
  }
}
