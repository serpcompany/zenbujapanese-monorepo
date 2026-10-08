import SwiftUI
import UniformTypeIdentifiers

extension View {
  func importsImagesFromDevices(_ open: @escaping @MainActor ([ImageTextAsset]) -> Void)
    -> some View
  {
    #if os(macOS)
      modifier(DeviceImageImport(open: open))
    #else
      self
    #endif
  }
}

#if os(macOS)
  private struct DeviceImageImport: ViewModifier {
    let open: @MainActor ([ImageTextAsset]) -> Void

    func body(content: Content) -> some View {
      content.importsItemProviders([.image]) { providers in
        guard !providers.isEmpty else { return false }
        Task { @MainActor in
          var assets: [ImageTextAsset] = []
          for provider in providers {
            if let data = await Self.imageData(from: provider),
              let asset = ImageTextAsset(pastedImageData: data, name: "Continuity Camera.jpg")
            {
              assets.append(asset)
            }
          }
          if !assets.isEmpty { open(assets) }
        }
        return true
      }
    }

    private static func imageData(from provider: NSItemProvider) async -> Data? {
      await withCheckedContinuation { continuation in
        _ = provider.loadDataRepresentation(for: .image) { data, _ in
          continuation.resume(returning: data)
        }
      }
    }
  }
#endif
