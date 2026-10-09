import SwiftUI

enum ImageTextSource {
  case camera
  case photoLibrary
}

struct ImageTextImport: ViewModifier {
  @Binding var requestedSource: ImageTextSource?
  let cameraAuthorizationClient: CameraAuthorizationClient
  let openImageText: ([ImageTextAsset]) -> Void
  @State private var showsCamera = false
  @State private var showsPhotoLibrary = false
  @State private var assetsAwaitingPicker: [ImageTextAsset]?
  @State private var imageImportAlert: ImageImportAlert?
  @State private var isShowingImageImportAlert = false
  @State private var imageImportTask: Task<Void, Never>?

  func body(content: Content) -> some View {
    content
      .onChange(of: requestedSource) { _, source in
        guard let source else { return }
        requestedSource = nil
        switch source {
        case .camera: presentCamera()
        case .photoLibrary: presentPhotoLibrary()
        }
      }
      .sheet(isPresented: $showsCamera, onDismiss: openAssetsAwaitingPicker) {
        ImageCameraPicker { result in
          importPickedImage(result, failure: "The captured image could not be read.")
          showsCamera = false
        }
        .ignoresSafeArea()
      }
      .sheet(isPresented: $showsPhotoLibrary, onDismiss: openAssetsAwaitingPicker) {
        ImagePhotoLibraryPicker { result in
          importPickedImage(result, failure: "The selected photos could not be read.")
          showsPhotoLibrary = false
        }
        .ignoresSafeArea()
      }
      .alert(
        imageImportAlert?.title ?? "",
        isPresented: $isShowingImageImportAlert,
        presenting: imageImportAlert
      ) { alert in
        if alert.offersSettings {
          Button("Open Settings", action: cameraAuthorizationClient.openSettings)
          Button("Cancel", role: .cancel) {}
        } else {
          Button("OK") {}
        }
      } message: { alert in
        Text(alert.message)
      }
      .onDisappear {
        imageImportTask?.cancel()
        imageImportTask = nil
      }
  }

  private func presentCamera() {
    imageImportTask?.cancel()
    imageImportTask = Task { @MainActor in
      await Task.yield()
      guard !Task.isCancelled else { return }
      guard cameraAuthorizationClient.isCameraAvailable() else {
        presentImageImportAlert(.cameraUnavailable)
        imageImportTask = nil
        return
      }
      switch cameraAuthorizationClient.state() {
      case .authorized:
        showsCamera = true
      case .notDetermined:
        let granted = await cameraAuthorizationClient.requestAccess()
        guard !Task.isCancelled else { return }
        if granted {
          showsCamera = true
        } else {
          presentImageImportAlert(.cameraDenied)
        }
      case .denied:
        presentImageImportAlert(.cameraDenied)
      case .restricted:
        presentImageImportAlert(.cameraRestricted)
      }
      imageImportTask = nil
    }
  }

  private func presentPhotoLibrary() {
    showsPhotoLibrary = true
  }

  private func importPickedImage(_ result: Result<[ImageTextAsset], Error>, failure: String) {
    switch result {
    case .success(let assets):
      if !assets.isEmpty { open(assets) }
    case .failure:
      presentImageImportAlert(.importFailure(failure))
    }
  }

  private var isPickerShown: Bool { showsCamera || showsPhotoLibrary }

  private func openAssetsAwaitingPicker() {
    guard !isPickerShown, let assets = assetsAwaitingPicker else { return }
    assetsAwaitingPicker = nil
    openImageText(assets)
  }

  private func open(_ assets: [ImageTextAsset]) {
    if isPickerShown {
      assetsAwaitingPicker = assets
    } else {
      openImageText(assets)
    }
  }

  private func presentImageImportAlert(_ alert: ImageImportAlert) {
    imageImportAlert = alert
    isShowingImageImportAlert = true
  }
}

private enum ImageImportAlert: Identifiable {
  case importFailure(String)
  case cameraUnavailable
  case cameraDenied
  case cameraRestricted

  var id: String {
    switch self {
    case .importFailure(let message): "import-\(message)"
    case .cameraUnavailable: "camera-unavailable"
    case .cameraDenied: "camera-denied"
    case .cameraRestricted: "camera-restricted"
    }
  }

  var title: String {
    switch self {
    case .importFailure: "Unable to Import Images"
    case .cameraUnavailable: "Camera Unavailable"
    case .cameraDenied: "Camera Access Denied"
    case .cameraRestricted: "Camera Access Restricted"
    }
  }

  var message: String {
    switch self {
    case .importFailure(let message): message
    case .cameraUnavailable: "Camera capture requires a physical device with an available camera."
    case .cameraDenied: "Allow Camera access in Settings to capture Japanese text."
    case .cameraRestricted: "Camera access is restricted on this device."
    }
  }

  var offersSettings: Bool {
    if case .cameraDenied = self { return true }
    return false
  }
}

