@preconcurrency import PhotosUI
import SwiftUI
import UniformTypeIdentifiers
import UIKit

struct ImageCameraPicker: UIViewControllerRepresentable {
  let completion: @MainActor @Sendable (Result<ImageTextAsset?, Error>) -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(completion: completion)
  }

  func makeUIViewController(context: Context) -> UIImagePickerController {
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    picker.cameraCaptureMode = .photo
    picker.mediaTypes = [UTType.image.identifier]
    picker.delegate = context.coordinator
    picker.modalPresentationStyle = .fullScreen
    return picker
  }

  func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

  @MainActor
  final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    let completion: @MainActor @Sendable (Result<ImageTextAsset?, Error>) -> Void

    init(completion: @escaping @MainActor @Sendable (Result<ImageTextAsset?, Error>) -> Void) {
      self.completion = completion
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
      completion(.success(nil))
    }

    func imagePickerController(
      _ picker: UIImagePickerController,
      didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
      guard let image = info[.originalImage] as? UIImage,
        let asset = ImageTextAsset(cameraImage: image)
      else {
        completion(.failure(ImageSourcePickerError.unreadableImage))
        return
      }
      completion(.success(asset))
    }
  }
}

struct ImagePhotoLibraryPicker: UIViewControllerRepresentable {
  let completion: @MainActor @Sendable (Result<[ImageTextAsset], Error>) -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(completion: completion)
  }

  func makeUIViewController(context: Context) -> PHPickerViewController {
    var configuration = PHPickerConfiguration(photoLibrary: .shared())
    configuration.filter = .images
    configuration.selectionLimit = 1
    let picker = PHPickerViewController(configuration: configuration)
    picker.delegate = context.coordinator
    return picker
  }

  func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}

  @MainActor
  final class Coordinator: NSObject, PHPickerViewControllerDelegate {
    let completion: @MainActor @Sendable (Result<[ImageTextAsset], Error>) -> Void

    init(completion: @escaping @MainActor @Sendable (Result<[ImageTextAsset], Error>) -> Void) {
      self.completion = completion
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
      guard !results.isEmpty else {
        completion(.success([]))
        return
      }
      let accumulator = PhotoSelectionAccumulator(count: results.count, completion: completion)
      for (index, result) in results.enumerated() {
        let suggestedName = result.itemProvider.suggestedName ?? "Photo \(index + 1)"
        result.itemProvider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) {
          data, error in
          let asset = data.flatMap { data in
            UIImage(data: data).flatMap { ImageTextAsset(photoLibraryImage: $0, name: suggestedName) }
          }
          accumulator.finish(index: index, asset: asset, error: error)
        }
      }
    }
  }
}

private final class PhotoSelectionAccumulator: @unchecked Sendable {
  private let lock = NSLock()
  private var assets: [ImageTextAsset?]
  private var completed = 0
  private var failed = false
  private let completion: @MainActor @Sendable (Result<[ImageTextAsset], Error>) -> Void

  init(
    count: Int,
    completion: @escaping @MainActor @Sendable (Result<[ImageTextAsset], Error>) -> Void
  ) {
    assets = Array(repeating: nil, count: count)
    self.completion = completion
  }

  func finish(index: Int, asset: ImageTextAsset?, error: Error?) {
    lock.lock()
    assets[index] = asset
    failed = failed || error != nil || asset == nil
    completed += 1
    let isComplete = completed == assets.count
    let selectedAssets = assets.compactMap { $0 }
    let didFail = failed
    lock.unlock()
    guard isComplete else { return }
    Task { @MainActor [completion] in
      if didFail || selectedAssets.isEmpty {
        completion(.failure(ImageSourcePickerError.unreadableImage))
      } else {
        completion(.success(selectedAssets))
      }
    }
  }
}

private extension ImageTextAsset {
  init?(cameraImage: UIImage) {
    guard let data = cameraImage.imageTextData else { return nil }
    self.init(name: "Camera Capture.jpg", data: data)
  }

  init?(photoLibraryImage: UIImage, name: String) {
    guard let data = photoLibraryImage.imageTextData else { return nil }
    self.init(name: name, data: data)
  }
}

private extension UIImage {
  var imageTextData: Data? {
    let maximumDimension: CGFloat = 4_096
    let largestDimension = max(size.width, size.height)
    let scale = largestDimension > maximumDimension ? maximumDimension / largestDimension : 1
    let outputSize = CGSize(width: size.width * scale, height: size.height * scale)
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    let normalized = UIGraphicsImageRenderer(size: outputSize, format: format).image { _ in
      draw(in: CGRect(origin: .zero, size: outputSize))
    }
    return normalized.jpegData(compressionQuality: 0.9)
  }
}

private enum ImageSourcePickerError: Error {
  case unreadableImage
}
