import Foundation

public enum SafariExtensionSpike {
  private static let reader = ShareCardReader.onDevice(
    unpackingTokenizerInto: URL.cachesDirectory.appending(path: "Tokenizer", directoryHint: .isDirectory))
  private static let started = Date()
  nonisolated(unsafe) private static var answered = 0

  public static func lookUp(_ text: String) async -> [String: any Sendable] {
    let began = Date()
    let card = await reader.card(for: .text(String(text.prefix(ShareCardReader.longestTextRead))))
    answered += 1
    var answer: [String: any Sendable] = ["kind": card.kind]
    switch card {
    case .word(let entry):
      answer["word"] = word(entry)
    case .text(let shown):
      answer["words"] = shown.words.prefix(8).map { word($0.entry, surface: $0.surface) }
    case .missing:
      break
    }
    answer["ms"] = Int(Date().timeIntervalSince(began) * 1000)
    answer["memory"] = memory()
    ShareCardMemory.note("safari lookUp \(card.kind)")
    return answer
  }

  @MainActor
  public static func save(_ action: String, id: String, headword: String, reading: String) async
    -> [String: any Sendable]
  {
    let stores = ShareCardStores.sharedWithTheApp()
    await stores.lists.flush()
    await stores.knowledge.flush()
    let entryID = LanguageReferenceID(rawValue: id)
    switch action {
    case "markKnown":
      stores.knowledge.setStatus(.known, id: entryID, headword: headword, reading: reading)
    case "addToFavorites":
      stores.lists.addWord(entryID, headword: headword, reading: reading, to: WordLists.favoritesID)
    default:
      return ["ok": false]
    }
    await stores.lists.flush()
    await stores.knowledge.flush()
    return [
      "ok": stores.savesToTheApp,
      "pending": SharedChanges.inbox?.pending().count ?? -1,
      "group": SharedContainer.identifier,
      "memory": memory(),
    ]
  }

  public static var appScheme: String {
    AppAction.scheme(ofApp: containingAppBundleID ?? Bundle.main.bundleIdentifier ?? "")
  }

  private static var containingAppBundleID: String? {
    BundledData.containingApp(of: Bundle.main.bundleURL).flatMap(Bundle.init(url:))?.bundleIdentifier
  }

  public static var dictionaryBundlePath: String { BundledData.bundle.bundlePath }

  @MainActor
  public static func applyPendingChanges() async -> [String: any Sendable] {
    let before = SharedChanges.inbox?.pending().count ?? -1
    await SharedChanges.inbox?.apply(to: WordLists.shared, WordKnowledge.shared)
    return [
      "pendingBefore": before,
      "pendingAfter": SharedChanges.inbox?.pending().count ?? -1,
      "known": WordKnowledge.shared.knownRecords.map(\.headword),
      "favorites": WordLists.shared.words(in: WordLists.favoritesID).map(\.headword),
    ]
  }

  public static func memory() -> [String: any Sendable] {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(
      MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
    let read = withUnsafeMutablePointer(to: &info) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
      }
    }
    guard read == KERN_SUCCESS else { return [:] }
    let mb = { (bytes: UInt64) in (Double(bytes) / 1_048_576 * 10).rounded() / 10 }
    return [
      "footprintMB": mb(info.phys_footprint),
      "peakMB": mb(UInt64(info.ledger_phys_footprint_peak)),
      "pid": Int(getpid()),
      "answered": answered,
      "processAgeS": Int(Date().timeIntervalSince(started)),
    ]
  }

  private static func word(_ entry: DictionaryEntry, surface: String? = nil) -> [String: any Sendable] {
    [
      "id": entry.id.rawValue,
      "headword": entry.headword,
      "reading": entry.reading,
      "surface": surface ?? entry.headword,
      "meanings": Array(entry.meanings.prefix(3)),
      "common": entry.isCommon,
    ]
  }
}
