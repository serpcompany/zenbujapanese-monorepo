@testable import SearchExperience

protocol SearchResultFixture {}

extension SearchResultFixture {
  var first: DictionaryEntry { entry(1, "一") }
  var second: DictionaryEntry { entry(2, "二") }

  var jlpt: FrequencyPackDisclosure {
    .fixture(id: "zenbu.jlpt.waller.levels", displayName: "JLPT Levels", kind: .level)
  }
  var youTube: FrequencyPackDisclosure {
    .fixture(id: "zenbu.tubelex.youtube.ja.unidic-3.1", displayName: "YouTube")
  }
  var anime: FrequencyPackDisclosure {
    .fixture(id: "zenbu.jiten.anime.ja.ordered-v2", displayName: "Anime")
  }

  private func entry(_ number: Int, _ headword: String) -> DictionaryEntry {
    DictionaryEntry.fixture(id: String(format: "%032d", number), headword: headword)
  }
}
