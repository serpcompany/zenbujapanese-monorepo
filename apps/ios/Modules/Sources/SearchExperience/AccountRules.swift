import Foundation

final class AccountRules: @unchecked Sendable {
  static let shared = AccountRules()

  private let lock = NSLock()
  private var core: Result<DictionaryCore, Error>?

  func name(_ typed: String) -> String? { text("accountName", typed) }

  func username(_ typed: String) -> String? { text("accountUsername", typed) }

  func usernameToSave(_ typed: String) -> String? { text("usernameToSave", typed) }

  func signInCode(_ typed: String) -> String? { text("signInCode", typed) }

  func listName(_ typed: String) -> String? { text("listName", typed) }

  func keptNoteText(_ typed: String) -> String { text("keptNoteText", typed) ?? typed }

  func noteFitsTheAccount(_ typed: String) -> Bool { text("noteText", typed) != nil }

  func sentVideos(_ videos: [WatchedVideo]) -> [WatchedVideo] {
    let clamped = videos.map { video in
      var video = video
      video.comprehension = video.comprehension.map { min($0, 1) }
      return video
    }
    var request = JSONBytes()
    request.append("[")
    for (index, video) in clamped.enumerated() {
      request.append(index == 0 ? "[" : ",[")
      for (field, text) in [video.title, video.author].enumerated() {
        if field > 0 { request.append(",") }
        if let text { request.appendString(text) } else { request.append("null") }
      }
      for number in [video.duration, video.position, video.comprehension] {
        request.append(number.flatMap { $0.isFinite ? ",\($0)" : nil } ?? ",null")
      }
      request.append("]")
    }
    request.append("]")
    let answer = text("sentWatches", request.text) ?? ""
    let parts = answer.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false)
    let marks = Array((parts.first ?? "").utf8)
    var replaced = parts.count > 1
      ? ((try? JSONDecoder().decode([String].self, from: Data(parts[1].utf8))) ?? []).makeIterator()
      : [String]().makeIterator()
    guard marks.count == clamped.count * 5 else { return clamped.map(\.withNothingToSend) }
    return clamped.enumerated().map { index, video in
      var sent = video
      let mark = { (field: Int) in marks[index * 5 + field] }
      sent.title = Self.kept(video.title, mark(0), &replaced)
      sent.author = Self.kept(video.author, mark(1), &replaced)
      sent.duration = mark(2) == Self.keep ? video.duration : nil
      sent.position = mark(3) == Self.keep ? video.position : nil
      sent.comprehension = mark(4) == Self.keep ? video.comprehension : nil
      return sent
    }
  }

  private static let keep = UInt8(ascii: "k")
  private static let replace = UInt8(ascii: "r")

  private static func kept(
    _ text: String?, _ mark: UInt8, _ replaced: inout IndexingIterator<[String]>
  ) -> String? {
    switch mark {
    case keep: text
    case replace: replaced.next()
    default: nil
    }
  }

  func prepareSoon() {
    Task.detached(priority: .utility) { self.prepare() }
  }

  private func prepare() {
    lock.withLock { _ = try? prepared() }
  }

  private func text(_ rule: String, _ argument: String) -> String? {
    lock.withLock { try? prepared().text(rule, argument) }
  }

  private func prepared() throws -> DictionaryCore {
    if let core { return try core.get() }
    let made = Result { try DictionaryCore(script: .accountRules) }
    core = made
    return try made.get()
  }
}
