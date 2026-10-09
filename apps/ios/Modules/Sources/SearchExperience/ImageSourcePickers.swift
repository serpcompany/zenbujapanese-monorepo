import ImageIO
import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

typealias ImagePickerCompletion = @MainActor @Sendable (Result<[ImageTextAsset], Error>) -> Void

@MainActor
class ImagePickerCoordinator: NSObject {
  let completion: ImagePickerCompletion

  init(completion: @escaping ImagePickerCompletion) {
    self.completion = completion
  }
}

struct ImageCameraPicker: UIViewControllerRepresentable {
  let completion: ImagePickerCompletion

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

  final class Coordinator: ImagePickerCoordinator, UIImagePickerControllerDelegate,
    UINavigationControllerDelegate
  {
    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
      completion(.success([]))
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
      completion(.success([asset]))
    }
  }
}

struct ImagePhotoLibraryPicker: UIViewControllerRepresentable {
  static let selectionLimit = 8
  let completion: ImagePickerCompletion

  func makeCoordinator() -> Coordinator {
    Coordinator(completion: completion)
  }

  func makeUIViewController(context: Context) -> PHPickerViewController {
    var configuration = PHPickerConfiguration()
    configuration.filter = .images
    configuration.selectionLimit = ImagePhotoLibraryPicker.selectionLimit
    let picker = PHPickerViewController(configuration: configuration)
    picker.delegate = context.coordinator
    return picker
  }

  func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}

  final class Coordinator: ImagePickerCoordinator, PHPickerViewControllerDelegate {
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
}

extension ImageTextAsset {
  init?(cameraImage: UIImage) {
    guard let data = cameraImage.imageTextData else { return nil }
    self.init(name: "Camera Capture.jpg", data: data)
  }
}

extension ImageTextAsset {
  init?(photoLibraryImageAt url: URL, name: String) {
    guard
      let source = CGImageSourceCreateWithURL(
        url as CFURL,
        [kCGImageSourceShouldCache: false] as CFDictionary
      ),
      let data = Self.normalizedPhotoData(from: source)
    else { return nil }
    self.init(name: name, data: data)
  }

  private static func normalizedPhotoData(from source: CGImageSource) -> Data? {
    guard
      let image = CGImageSourceCreateThumbnailAtIndex(
        source, 0,
        [
          kCGImageSourceCreateThumbnailFromImageAlways: true,
          kCGImageSourceCreateThumbnailWithTransform: true,
          kCGImageSourceThumbnailMaxPixelSize: 4_096,
          kCGImageSourceShouldCacheImmediately: true,
        ] as CFDictionary)
    else { return nil }
    return UIImage(cgImage: image).jpegData(compressionQuality: 0.9)
  }
}

extension UIImage {
  fileprivate var imageTextData: Data? {
    guard size.width > 0, size.height > 0 else { return nil }
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

enum ImageSourcePickerError: Error {
  case unreadableImage
}
