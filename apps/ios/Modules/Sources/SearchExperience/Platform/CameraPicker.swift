import SwiftUI
import UniformTypeIdentifiers

#if os(iOS)
  import UIKit
#endif

@MainActor
enum CameraCapture {
  #if os(macOS)
    nonisolated static let isOffered = false
    static let isAvailable = false
  #else
    nonisolated static let isOffered = true
    static var isAvailable: Bool {
      LaunchHarness.cameraImageURL != nil || UIImagePickerController.isSourceTypeAvailable(.camera)
    }
  #endif
}

#if os(macOS)
  struct ImageCameraPicker: View {
    let completion: ImagePickerCompletion

    var body: some View {
      Color.clear.onAppear { completion(.success(nil)) }
    }
  }
#else
  struct ImageCameraPicker: View {
    let completion: ImagePickerCompletion

    var body: some View {
      if let standIn = LaunchHarness.cameraImageURL {
        Color.clear.onAppear {
          completion(
            ImageTextAsset(cameraImageAt: standIn).map { .success($0) }
              ?? .failure(ImageSourcePickerError.unreadableImage))
        }
      } else {
        SystemCameraPicker(completion: completion)
      }
    }
  }

  private struct SystemCameraPicker: UIViewControllerRepresentable {
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

    fileprivate init?(cameraImageAt url: URL) {
      guard let image = UIImage(contentsOfFile: url.path) else { return nil }
      self.init(cameraImage: image)
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
#endif
