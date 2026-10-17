import Foundation
import UniformTypeIdentifiers

public enum ShareAction: Sendable {
  case lookUp
  case translate
  case imageSearch

  @MainActor
  public func appURL(for items: [NSExtensionItem], extensionBundleID: String) async -> URL? {
    let app = AppAction.appBundleID(ofExtension: extensionBundleID)
    let images = SharedImages(appGroup: AppAction.appGroup(ofApp: app))
    return await appAction(for: items, sharedImages: images)?.url(scheme: AppAction.scheme(ofApp: app))
  }

  @MainActor
  public func appAction(for items: [NSExtensionItem], sharedImages: SharedImages?) async
    -> AppAction?
  {
    switch self {
    case .lookUp: return await Self.sharedText(in: items).map(AppAction.lookUp)
    case .translate: return await Self.sharedText(in: items).map(AppAction.translate)
    case .imageSearch:
      guard let sharedImages, let share = try? sharedImages.newShare() else { return nil }
      var stored: [String] = []
      for provider in Self.providers(in: items, conformingTo: .image) {
        if let name = await Self.storedCopy(of: provider, in: share, besides: stored) {
          stored.append(name)
        }
      }
      return stored.isEmpty ? nil : .imageSearch(share: share.id, images: stored)
    }
  }

  @MainActor
  private static func sharedText(in items: [NSExtensionItem]) async -> String? {
    for provider in providers(in: items, conformingTo: .plainText) {
      if let text = await loadedText(provider), hasText(text) { return text }
    }
    return items.lazy.compactMap { $0.attributedContentText?.string }.first(where: hasText)
  }

  private static func hasText(_ text: String) -> Bool {
    !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  @MainActor
  private static func providers(in items: [NSExtensionItem], conformingTo type: UTType)
    -> [NSItemProvider]
  {
    items.flatMap { $0.attachments ?? [] }
      .filter { $0.hasItemConformingToTypeIdentifier(type.identifier) }
  }

  @MainActor
  private static func loadedText(_ provider: NSItemProvider) async -> String? {
    let type =
      provider.registeredTypeIdentifiers.first { UTType($0)?.conforms(to: .plainText) == true }
      ?? UTType.plainText.identifier
    return await withCheckedContinuation { continuation in
      provider.loadItem(forTypeIdentifier: type, options: nil) { item, _ in
        continuation.resume(returning: ShareAction.text(of: item))
      }
    }
  }

  static func text(of item: NSSecureCoding?) -> String? {
    switch item {
    case let text as String: text
    case let text as NSAttributedString: text.string
    case let data as Data:
      String(data: data, encoding: .utf8) ?? String(data: data, encoding: .utf16)
    default: nil
    }
  }

  @MainActor
  private static func storedCopy(
    of provider: NSItemProvider, in share: SharedImages.Share, besides stored: [String]
  ) async -> String? {
    let suggestedName = provider.suggestedName
    return await withCheckedContinuation { continuation in
      _ = provider.loadFileRepresentation(for: .image, openInPlace: false) { file, _, _ in
        let name = file.flatMap {
          try? share.storeCopy(of: $0, suggestedName: suggestedName, besides: stored)
        }
        continuation.resume(returning: name)
      }
    }
  }
}
