import AVFoundation

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
      guard LaunchHarness.cameraImageURL == nil else { return CameraAuthorizationState.authorized }
      return switch AVCaptureDevice.authorizationStatus(for: .video) {
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
      CameraCapture.isAvailable
    },
    openSettings: {
      SystemSettings.open(.camera)
    }
  )
}
