import SwiftUI
import UniformTypeIdentifiers

enum ImageTextSource: CaseIterable, Identifiable {
  case camera
  case photoLibrary
  case paste

  static let importLimit = 8

  static var offered: [ImageTextSource] { allCases.filter(\.isOffered) }

  var id: Self { self }

  var isOffered: Bool {
    switch self {
    case .camera: CameraCapture.isOffered
    case .photoLibrary: true
    case .paste: Pasteboard.offersImagePaste
    }
  }

  var title: LocalizedStringKey {
    switch self {
    case .camera: "Take Photo"
    case .photoLibrary: "Photo Library"
    case .paste: "Paste Image"
    }
  }

  var accessibilityIdentifier: String {
    switch self {
    case .camera: "translate.image.take-photo"
    case .photoLibrary: "translate.image.photo-library"
    case .paste: "translate.image.paste"
    }
  }
}

struct ImageTextImport: ViewModifier {
  @Binding var showsSources: Bool
  let cameraAuthorizationClient: CameraAuthorizationClient
  let openImageText: ([ImageTextAsset]) -> Void
  @State private var chosenSource: ImageTextSource?
  @State private var requestedSource: ImageTextSource?
  @State private var showsCamera = false
  @State private var showsPhotoLibrary = false
  @State private var assetsAwaitingPicker: [ImageTextAsset]?
  @State private var imageImportAlert: ImageImportAlert?
  @State private var isShowingImageImportAlert = false
  @State private var imageImportTask: Task<Void, Never>?

  func body(content: Content) -> some View {
    content
      .alert("Image", isPresented: $showsSources) {
        ForEach(ImageTextSource.offered) { source in
          Button(source.title) { chosenSource = source }
            .accessibilityIdentifier(source.accessibilityIdentifier)
        }
        Button("Cancel", role: .cancel) {}
      } message: {
        Text("Then tap any word to look it up.")
      }
      .onChange(of: showsSources) { _, shown in
        guard !shown, let source = chosenSource else { return }
        chosenSource = nil
        requestedSource = source
      }
      .onDrop(of: [.image], isTargeted: nil) { providers in
        guard !providers.isEmpty else { return false }
        importDroppedImages(Array(providers.prefix(ImageTextSource.importLimit)))
        return true
      }
      .importsImagesFromDevices { assets in open(assets) }
      .onChange(of: requestedSource) { _, source in
        guard let source else { return }
        requestedSource = nil
        switch source {
        case .camera: presentCamera()
        case .photoLibrary: presentPhotoLibrary()
        case .paste: pasteImage()
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

  private func importDroppedImages(_ providers: [NSItemProvider]) {
    imageImportTask?.cancel()
    imageImportTask = Task {
      var assets: [ImageTextAsset] = []
      for provider in providers {
        if let asset = await ImageTextAsset.dropped(provider) { assets.append(asset) }
      }
      guard !Task.isCancelled else { return }
      if assets.isEmpty {
        presentImageImportAlert(.importFailure("The dropped files are not supported images."))
      } else {
        open(assets)
      }
      imageImportTask = nil
    }
  }

  private func pasteImage() {
    switch Pasteboard.image {
    case .files(let files): importPastedFiles(files)
    case .data(let data): importPastedImage(data)
    case nil: presentImageImportAlert(.importFailure("The clipboard doesn't hold an image."))
    }
  }

  private func importPastedFiles(_ urls: [URL]) {
    imageImportTask?.cancel()
    imageImportTask = Task {
      var assets: [ImageTextAsset] = []
      for url in urls.prefix(ImageTextSource.importLimit) {
        guard !Task.isCancelled else { return }
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        if let asset = try? await ImageTextAsset.loadCopy(from: url) {
          assets.append(asset)
        }
      }
      guard !Task.isCancelled else { return }
      if assets.isEmpty {
        presentImageImportAlert(.importFailure("The pasted files are not supported images."))
      } else {
        open(assets)
      }
      imageImportTask = nil
    }
  }

  private func importPastedImage(_ data: Data) {
    imageImportTask?.cancel()
    imageImportTask = Task {
      let asset = await Task.detached(priority: .userInitiated) {
        ImageTextAsset(pastedImageData: data, name: "Pasted Image.jpg")
      }.value
      guard !Task.isCancelled else { return }
      if let asset {
        open([asset])
      } else {
        presentImageImportAlert(.importFailure("The pasted image could not be read."))
      }
      imageImportTask = nil
    }
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
