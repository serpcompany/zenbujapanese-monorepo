@preconcurrency import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct SearchImageImport: ViewModifier {
  @Binding var showsImageSources: Bool
  let cameraAuthorizationClient: CameraAuthorizationClient
  let openImageText: ([ImageTextAsset]) -> Void
  @State private var presentedImageSource: ImageSourceSheet?
  @State private var showsPhotoLibrary = false
  @State private var selectedPhotoItems: [PhotosPickerItem] = []
  @State private var showsFileImporter = false
  @State private var imageImportAlert: ImageImportAlert?
  @State private var isShowingImageImportAlert = false
  @State private var imageImportTask: Task<Void, Never>?

  func body(content: Content) -> some View {
    content
      .confirmationDialog("Image Search", isPresented: $showsImageSources) {
        if CameraCapture.isOffered {
          Button("Take Photo") { presentCamera() }
            .accessibilityIdentifier("image-source.camera")
        }
        Button("Photo Library") { presentPhotoLibrary() }
          .accessibilityIdentifier("image-source.photo-library")
        Button("Files") { showsFileImporter = true }
          .accessibilityIdentifier("image-source.files")
        if Pasteboard.offersImagePaste {
          Button("Paste Image") { pasteImage() }
            .accessibilityIdentifier("image-source.paste")
        }
        Button("Cancel", role: .cancel) {}
      }
      .onDrop(of: [.image], isTargeted: nil) { providers in
        guard !providers.isEmpty else { return false }
        importDroppedImages(Array(providers.prefix(8)))
        return true
      }
      .importsImagesFromDevices { assets in openImageText(assets) }
      .sheet(item: $presentedImageSource) { source in
        switch source {
        case .camera:
          ImageCameraPicker { result in
            presentedImageSource = nil
            importCameraImage(result)
          }
          .ignoresSafeArea()
        }
      }
      .photosPicker(
        isPresented: $showsPhotoLibrary,
        selection: $selectedPhotoItems,
        maxSelectionCount: 1,
        matching: .images
      )
      .onChange(of: selectedPhotoItems) { _, items in
        importPhotoLibraryItems(items)
      }
      .fileImporter(
        isPresented: $showsFileImporter,
        allowedContentTypes: [.image],
        allowsMultipleSelection: true,
        onCompletion: importImages,
        onCancellation: {}
      )
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

  private func importImages(_ result: Result<[URL], Error>) {
    guard case .success(let urls) = result else {
      if case .failure(let error) = result,
        error is CancellationError || (error as? CocoaError)?.code == .userCancelled
      {
        return
      }
      presentImageImportAlert(.importFailure("The Files selection could not be read."))
      return
    }
    guard !urls.isEmpty else { return }
    imageImportTask?.cancel()
    imageImportTask = Task {
      var assets: [ImageTextAsset] = []
      for url in urls.prefix(8) {
        guard !Task.isCancelled else { return }
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        if let asset = try? await ImageTextAsset.loadCopy(from: url) {
          assets.append(asset)
        }
      }
      guard !Task.isCancelled else { return }
      guard !assets.isEmpty else {
        presentImageImportAlert(.importFailure("The selected files are not supported images."))
        return
      }
      openImageText(assets)
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
        presentedImageSource = .camera
      case .notDetermined:
        let granted = await cameraAuthorizationClient.requestAccess()
        guard !Task.isCancelled else { return }
        if granted {
          presentedImageSource = .camera
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
        openImageText(assets)
      }
      imageImportTask = nil
    }
  }

  private func pasteImage() {
    switch Pasteboard.image {
    case .files(let files): importImages(.success(files))
    case .data(let data): importPastedImage(data)
    case nil: presentImageImportAlert(.importFailure("The clipboard doesn't hold an image."))
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
        openImageText([asset])
      } else {
        presentImageImportAlert(.importFailure("The pasted image could not be read."))
      }
      imageImportTask = nil
    }
  }

  private func presentPhotoLibrary() {
    selectedPhotoItems = []
    showsPhotoLibrary = true
  }

  private func importCameraImage(_ result: Result<ImageTextAsset?, Error>) {
    switch result {
    case .success(let asset):
      if let asset { openImageText([asset]) }
    case .failure:
      presentImageImportAlert(.importFailure("The captured image could not be read."))
    }
  }

  private func importPhotoLibraryItems(_ items: [PhotosPickerItem]) {
    guard !items.isEmpty else { return }
    imageImportTask?.cancel()
    imageImportTask = Task {
      do {
        var assets: [ImageTextAsset] = []
        for item in items {
          guard let selected = try await item.loadTransferable(type: SelectedImageTextPhoto.self)
          else { continue }
          assets.append(selected.asset)
        }
        guard !Task.isCancelled else { return }
        guard !assets.isEmpty else { throw ImageSourcePickerError.unreadableImage }
        selectedPhotoItems = []
        openImageText(assets)
      } catch is CancellationError {
        return
      } catch {
        selectedPhotoItems = []
        presentImageImportAlert(.importFailure("The selected photos could not be read."))
      }
      imageImportTask = nil
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

private enum ImageSourceSheet: String, Identifiable {
  case camera

  var id: String { rawValue }
}

private struct SelectedImageTextPhoto: Transferable {
  let asset: ImageTextAsset

  static var transferRepresentation: some TransferRepresentation {
    FileRepresentation(importedContentType: .image) { received in
      guard
        let asset = ImageTextAsset(
          photoLibraryImageAt: received.file,
          name: received.file.lastPathComponent)
      else {
        throw ImageSourcePickerError.unreadableImage
      }
      return SelectedImageTextPhoto(asset: asset)
    }
  }
}
