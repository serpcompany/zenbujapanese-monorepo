import Foundation

@testable import SearchExperience

extension SharedChanges {
  static func holding(_ word: KnownWordChange, madeAt made: Date, in folder: URL) throws
    -> SharedChanges
  {
    let inbox = SharedChanges(folder: folder.appending(path: "Inbox"))
    try FileManager.default.createDirectory(at: inbox.folder, withIntermediateDirectories: true)
    let name = String(
      format: "%020llu-%010d-%@.json", UInt64(made.timeIntervalSince1970 * 1_000_000_000), 1,
      UUID().uuidString)
    try JSONEncoder.localStore.encode(SharedChange.known(word))
      .write(to: inbox.folder.appending(path: name))
    return inbox
  }
}
