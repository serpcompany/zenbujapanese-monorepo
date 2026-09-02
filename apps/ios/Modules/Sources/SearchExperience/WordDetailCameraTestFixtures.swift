#if DEBUG
  import Foundation
  import ImageIO
  import UIKit
  import UniformTypeIdentifiers

  enum WordDetailCameraFixtureScenario {
    case capture
    case cancel
    case failure
    case notDeterminedDenied
    case notDeterminedGranted

    static var current: Self? {
      let arguments = ProcessInfo.processInfo.arguments
      if arguments.contains("-WordDetailCameraFixtureCapture") { return .capture }
      if arguments.contains("-WordDetailCameraFixtureCancel") { return .cancel }
      if arguments.contains("-WordDetailCameraFixtureFailure") { return .failure }
      if arguments.contains("-CameraAuthorizationNotDeterminedDenied") {
        return .notDeterminedDenied
      }
      if arguments.contains("-CameraAuthorizationNotDeterminedGranted") {
        return .notDeterminedGranted
      }
      return nil
    }
  }

  @MainActor
  enum WordDetailCameraTestFixtures {
    static func resultFromProcessArguments() -> Result<ImageTextAsset?, Error>? {
      switch WordDetailCameraFixtureScenario.current {
      case .failure:
        if let invalidAsset = ImageTextAsset(cameraImage: UIImage()) {
          return .success(invalidAsset)
        }
        return .failure(ImageSourcePickerError.unreadableImage)
      case .capture, .notDeterminedGranted:
        break
      case .cancel, .notDeterminedDenied, nil:
        return nil
      }
      guard
        let url = Bundle.main.url(
          forResource: "fixture-clear-horizontal",
          withExtension: "png",
          subdirectory: "ImageTextFixtures"
        ),
        let sourceImage = UIImage(contentsOfFile: url.path),
        let image = cameraImageWithMetadata(sourceImage),
        let asset = ImageTextAsset(cameraImage: image)
      else { return .failure(ImageSourcePickerError.unreadableImage) }
      return .success(asset)
    }

    private static func cameraImageWithMetadata(_ image: UIImage) -> UIImage? {
      guard let cgImage = image.cgImage else { return nil }
      let data = NSMutableData()
      guard
        let destination = CGImageDestinationCreateWithData(
          data,
          UTType.jpeg.identifier as CFString,
          1,
          nil
        )
      else { return nil }
      let properties: [CFString: Any] = [
        kCGImagePropertyGPSDictionary: [
          kCGImagePropertyGPSLatitude: 35.6812,
          kCGImagePropertyGPSLatitudeRef: "N",
          kCGImagePropertyGPSLongitude: 139.7671,
          kCGImagePropertyGPSLongitudeRef: "E",
        ],
        kCGImagePropertyTIFFDictionary: [
          kCGImagePropertyTIFFMake: "External Fixture Camera",
          kCGImagePropertyTIFFModel: "Issue 238",
        ],
      ]
      CGImageDestinationAddImage(destination, cgImage, properties as CFDictionary)
      guard CGImageDestinationFinalize(destination) else { return nil }
      return UIImage(data: data as Data)
    }
  }
#endif
