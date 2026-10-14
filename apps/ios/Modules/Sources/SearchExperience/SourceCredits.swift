import Foundation

struct SourceCredit: Decodable, Equatable, Identifiable, Sendable {
  struct License: Decodable, Equatable, Sendable {
    let name: String
    let url: URL?
  }

  let id: String
  let name: String
  let url: URL
  let credit: String
  let license: License
  let notice: String?
}

struct SourceCredits: Decodable, Equatable, Sendable {
  let conversionNotice: String
  let credits: [SourceCredit]

  private static let client = "app"

  static let shown: SourceCredits? = asked {
    try PresentationCore.shared.answer("sourceCredits", client)
  }

  static func asked(_ ask: () throws -> SourceCredits) -> SourceCredits? {
    guard let answer = try? ask(), !answer.credits.isEmpty else { return nil }
    return answer
  }

  func credit(_ id: String) -> SourceCredit? {
    credits.first { $0.id == id }
  }
}
