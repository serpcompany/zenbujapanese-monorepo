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
            if let asset = await Self.asset(from: provider) { assets.append(asset) }
          }
          if !assets.isEmpty { open(assets) }
        }
        return true
      }
    }

    private static func asset(from provider: NSItemProvider) async -> ImageTextAsset? {
      await withCheckedContinuation { continuation in
        _ = provider.loadDataRepresentation(for: .image) { data, _ in
          continuation.resume(
            returning: data.flatMap {
              ImageTextAsset(pastedImageData: $0, name: "Continuity Camera.jpg")
            })
        }
      }
    }
  }
#endif
