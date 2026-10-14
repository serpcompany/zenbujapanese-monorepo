import Foundation

struct TatoebaContributorCredit: Decodable, Identifiable, Sendable {
  let username: String
  let sentenceSideCount: Int
  var id: String { username }
}

enum TatoebaAttributionClient {
  static func contributorCredits() async -> [TatoebaContributorCredit] {
    (try? await LanguageReferenceData.shared.tatoebaContributors()) ?? []
  }
}
