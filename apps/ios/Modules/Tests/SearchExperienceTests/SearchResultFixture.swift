@testable import SearchExperience

protocol SearchResultFixture {}

extension SearchResultFixture {
  var first: DictionaryEntry { entry(1, "一") }
  var second: DictionaryEntry { entry(2, "二") }
  var third: DictionaryEntry { entry(3, "三") }
  var fourth: DictionaryEntry { entry(4, "四") }
  var fifth: DictionaryEntry { entry(5, "五") }

  var jlpt: FrequencyPackDisclosure {
    .fixture(id: "zenbu.jlpt.waller.levels", displayName: "JLPT Levels", kind: .level)
  }
  var youTube: FrequencyPackDisclosure {
    .fixture(id: "zenbu.tubelex.youtube.ja.unidic-3.1", displayName: "YouTube")
  }
  var anime: FrequencyPackDisclosure {
    .fixture(id: "zenbu.jiten.anime.ja.ordered-v2", displayName: "Anime")
  }

  func ids(_ entries: DictionaryEntry...) -> [LanguageReferenceID] {
    entries.map(\.id)
  }

  func result(
    _ value: Int?, from dictionary: FrequencyPackDisclosure, for entry: DictionaryEntry
  ) -> FrequencyLookupResult {
    guard let value else { return .noEvidence(pack: dictionary) }
    switch dictionary.kind {
    case .rank:
      return .evidence(
        FrequencyEvidence.fixture(pack: dictionary, languageReferenceID: entry.id, rank: value))
    case .level:
      let level = JLPTLevel(rawValue: min(max(value, 1), 5)) ?? .n3
      return .level(
        FrequencyLevelEvidence(pack: dictionary, languageReferenceID: entry.id, level: level))
    }
  }

  private func entry(_ number: Int, _ headword: String) -> DictionaryEntry {
    DictionaryEntry.fixture(id: String(format: "%032d", number), headword: headword)
  }
}
