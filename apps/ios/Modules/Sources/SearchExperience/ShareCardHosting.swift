import SwiftUI
import UniformTypeIdentifiers

extension ShareCardReader {
  static func onDevice(unpackingTokenizerInto folder: URL) -> ShareCardReader {
    let dictionary = LanguageReferenceData(morphology: .unavailable)
    let analysis = JapaneseTextAnalysisClient.live(
      text: DictionaryTextData(tokenizerFile: TokenizerFiles.mapped(unpackingInto: folder)))
    let lookup = LookupClient.reading(dictionary)
    return ShareCardReader(
      lookUp: { await dictionary.route(lookingUp: $0) },
      search: { try await dictionary.search($0) },
      linkedTokens: { await analysis.linkedTokens($0) },
      entries: { (try? await lookup.entries($0)) ?? [:] },
      recognize: ImageTextRecognitionClient.live.recognize)
  }
}

@MainActor
struct ShareCardStores {
  let lists: WordLists
  let knowledge: WordKnowledge
  let savesToTheApp: Bool

  static func sharedWithTheApp() -> ShareCardStores {
    guard let inbox = SharedChanges.inbox,
      let lists = SharedContainer.copy(named: SharedContainer.wordLists),
      let knowledge = SharedContainer.copy(named: SharedContainer.wordKnowledge)
    else { return unshared() }
    let stores = ShareCardStores(
      lists: WordLists(fileURL: lists), knowledge: WordKnowledge(fileURL: knowledge),
      savesToTheApp: true)
    stores.lists.changeObserver = inbox.record
    stores.knowledge.changeObserver = inbox.record
    return stores
  }

  private static func unshared() -> ShareCardStores {
    let scratch = URL.temporaryDirectory.appending(path: UUID().uuidString)
    return ShareCardStores(
      lists: WordLists(fileURL: scratch.appending(path: SharedContainer.wordLists)),
      knowledge: WordKnowledge(fileURL: scratch.appending(path: SharedContainer.wordKnowledge)),
      savesToTheApp: false)
  }
}

@MainActor
@Observable
final class SharedItemRequest {
  var item: SharedItem?
}

struct ShareCardScene: View {
  let request: SharedItemRequest
  let reader: ShareCardReader
  let stores: ShareCardStores
  let done: () -> Void
  @State private var readingAids = ReadingAidPreferences()

  var body: some View {
    ShareCardView(
      item: request.item, reader: reader, translation: .live,
      savesToTheApp: stores.savesToTheApp, done: done
    )
    .environment(readingAids)
    .environment(stores.lists)
    .environment(stores.knowledge)
  }
}

@MainActor
enum SharedItemReading {
  static func first(in attachments: [NSItemProvider]) async -> SharedItem {
    if let image = attachments.first(where: {
      $0.hasItemConformingToTypeIdentifier(UTType.image.identifier)
    }) {
      return .image(await photo(of: image) ?? Data())
    }
    for attachment in attachments
    where attachment.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)
      && !attachment.hasItemConformingToTypeIdentifier(UTType.url.identifier)
    {
      if let text = await text(of: attachment) { return .text(text) }
    }
    return .text("")
  }

  private static func photo(of attachment: NSItemProvider) async -> Data? {
    let fromFile = await withCheckedContinuation { continuation in
      _ = attachment.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { file, _ in
        continuation.resume(returning: file.flatMap(ShareCardReader.downscaled(file:)))
      }
    }
    if let fromFile { return fromFile }
    return await withCheckedContinuation { continuation in
      _ = attachment.loadDataRepresentation(for: .image) { data, _ in
        continuation.resume(returning: data.flatMap(ShareCardReader.downscaled))
      }
    }
  }

  private static func text(of attachment: NSItemProvider) async -> String? {
    await withCheckedContinuation { continuation in
      attachment.loadItem(forTypeIdentifier: UTType.plainText.identifier) { item, _ in
        let text =
          (item as? String) ?? (item as? NSAttributedString)?.string
          ?? (item as? Data).flatMap { String(data: $0, encoding: .utf8) }
        continuation.resume(returning: text)
      }
    }
  }
}
