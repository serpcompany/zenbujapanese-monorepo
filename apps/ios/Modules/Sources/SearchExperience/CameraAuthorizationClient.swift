import AVFoundation
import UIKit

enum CameraAuthorizationState: Sendable {
  case authorized
  case notDetermined
  case denied
  case restricted
}

struct CameraAuthorizationClient: Sendable {
  var state: @MainActor @Sendable () -> CameraAuthorizationState
  var requestAccess: @Sendable () async -> Bool
  var isCameraAvailable: @MainActor @Sendable () -> Bool
  var openSettings: @MainActor @Sendable () -> Void

  static let live = CameraAuthorizationClient(
    state: {
      switch AVCaptureDevice.authorizationStatus(for: .video) {
      case .authorized: .authorized
      case .notDetermined: .notDetermined
      case .denied: .denied
      case .restricted: .restricted
      @unknown default: .restricted
      }
    },
    requestAccess: {
      await AVCaptureDevice.requestAccess(for: .video)
    },
    isCameraAvailable: {
      UIImagePickerController.isSourceTypeAvailable(.camera)
    },
    openSettings: {
      guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
      UIApplication.shared.open(url)
    }
  )

  #if DEBUG
    static func clientFromProcessArguments() -> CameraAuthorizationClient? {
      let arguments = ProcessInfo.processInfo.arguments
      if arguments.contains("-CameraUnavailable") {
        return CameraAuthorizationClient(
          state: { .authorized },
          requestAccess: { true },
          isCameraAvailable: { false },
          openSettings: {}
        )
      }
      if arguments.contains("-CameraAuthorizationDenied") {
        return CameraAuthorizationClient(
          state: { .denied },
          requestAccess: { false },
          isCameraAvailable: { true },
          openSettings: {}
        )
      }
      if arguments.contains("-CameraAuthorizationRestricted") {
        return CameraAuthorizationClient(
          state: { .restricted },
          requestAccess: { false },
          isCameraAvailable: { true },
          openSettings: {}
        )
      }
      switch WordDetailCameraFixtureScenario.current {
      case .notDeterminedDenied:
        return CameraAuthorizationClient(
          state: { .notDetermined },
          requestAccess: { false },
          isCameraAvailable: { true },
          openSettings: {}
        )
      case .notDeterminedGranted:
        return CameraAuthorizationClient(
          state: { .notDetermined },
          requestAccess: { true },
          isCameraAvailable: { true },
          openSettings: {}
        )
      case .capture, .cancel, .failure:
        return CameraAuthorizationClient(
          state: { .authorized },
          requestAccess: { true },
          isCameraAvailable: { true },
          openSettings: {}
        )
      case nil:
        break
      }
      return nil
    }
  #endif
}
