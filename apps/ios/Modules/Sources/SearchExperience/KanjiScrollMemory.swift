struct KanjiScrollMemory {
  private(set) var wordIDs: [KanjiCharacter: LanguageReferenceID] = [:]
  private(set) var elementIDs: [KanjiCharacter: KanjiElementID] = [:]
  private(set) var contributions: [KanjiElementID: KanjiCharacter] = [:]

  mutating func remember(
    leaving origin: SearchExperienceRoute?, for destination: SearchExperienceRoute?
  ) {
    switch (origin, destination) {
    case (.kanji(let character, _), .word(let entry, _)):
      wordIDs[character] = entry.id
      elementIDs[character] = nil
    case (.kanji(let character, _), .kanjiElement(let elementID)):
      elementIDs[character] = elementID
      wordIDs[character] = nil
    case (.kanjiElement(let elementID), .kanji(let character, _)):
      contributions[elementID] = character
      wordIDs[character] = nil
    case (_, .kanji(let character, _)):
      wordIDs[character] = nil
    default:
      break
    }
  }
}
