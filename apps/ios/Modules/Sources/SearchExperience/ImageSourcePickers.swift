import ImageIO
import SwiftUI
import UIKit
import UniformTypeIdentifiers

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
  final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate
  {
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
