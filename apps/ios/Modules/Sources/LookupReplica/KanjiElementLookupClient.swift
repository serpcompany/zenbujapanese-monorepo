import Foundation

struct KanjiElementID: Codable, Hashable, Sendable {
  let rawValue: String

  init?(_ value: String) {
    guard let character = KanjiCharacter(value) else { return nil }
    rawValue = character.rawValue
  }
}

enum KanjiElementRole: String, Codable, Hashable, Sendable {
  case meaningStructure
  case sound
  case soundPattern

  var label: String {
    switch self {
    case .meaningStructure: "MEANING / STRUCTURE"
    case .sound: "SOUND"
    case .soundPattern: "SOUND PATTERN"
    }
  }
}

struct KanjiElementSummary: Codable, Hashable, Identifiable, Sendable {
  let id: KanjiElementID
  let meanings: [String]
  let commonLinkedOnReadings: [String]
  let role: KanjiElementRole
}

struct KanjiElementContribution: Codable, Hashable, Identifiable, Sendable {
  let character: KanjiCharacter
  let meanings: [String]
  let onReadings: [String]
  let frequencyRank: Int?

  var id: KanjiCharacter { character }
}

struct KanjiElementProvenance: Codable, Hashable, Sendable {
  let sourceIdentity: String
  let sourceSnapshot: String
  let sourceRecordID: String
}

struct KanjiElementEntry: Codable, Hashable, Identifiable, Sendable {
  let id: KanjiElementID
  let meanings: [String]
  let onReadings: [String]
  let commonLinkedOnReadings: [String]
  let alternatives: [KanjiElementID]
  let standaloneKanji: KanjiElementContribution?
  let containingKanji: [KanjiElementContribution]
  let structureProvenance: KanjiElementProvenance
  let metadataProvenance: KanjiElementProvenance
}

struct KanjiElementLookupClient: Sendable {
  var elements: @Sendable (KanjiCharacter) async throws -> [KanjiElementSummary]
  var entry: @Sendable (KanjiElementID) async throws -> KanjiElementEntry?

  static let live = KanjiElementLookupClient(
    elements: { character in try await KanjiElementReferenceData.shared.elements(character) },
    entry: { id in try await KanjiElementReferenceData.shared.entry(id) }
  )

  #if DEBUG
  static func clientFromProcessArguments() -> KanjiElementLookupClient? {
    guard ProcessInfo.processInfo.arguments.contains("-InjectKanjiElementFailureOnce") else {
      return nil
    }
    let fixture = KanjiElementFailureFixture()
    return KanjiElementLookupClient(
      elements: { character in try await KanjiElementLookupClient.live.elements(character) },
      entry: { id in
        if await fixture.consumeFailure() {
          throw KanjiElementFixtureError.injectedFailure
        }
        return try await KanjiElementLookupClient.live.entry(id)
      }
    )
  }
  #endif
}

#if DEBUG
private actor KanjiElementFailureFixture {
  private var hasFailed = false

  func consumeFailure() -> Bool {
    guard !hasFailed else { return false }
    hasFailed = true
    return true
  }
}

private enum KanjiElementFixtureError: Error {
  case injectedFailure
}
#endif

private actor KanjiElementReferenceData {
  static let shared = KanjiElementReferenceData()

  private var loadedCatalog: LoadedKanjiElementCatalog?

  func elements(_ character: KanjiCharacter) throws -> [KanjiElementSummary] {
    let catalog = try catalog()
    guard let kanji = catalog.kanjiByCharacter[glyphKey(character.rawValue)] else { return [] }
    return kanji.elementGlyphs.compactMap { glyph in
      guard let id = KanjiElementID(glyph),
            let element = catalog.elementByGlyph[glyphKey(glyph)] else { return nil }
      let role: KanjiElementRole
      if kanji.explicitPhoneticElement == glyph {
        role = .sound
      } else if !Set(element.commonLinkedOnReadings).isDisjoint(with: kanji.onReadings) {
        role = .soundPattern
      } else {
        role = .meaningStructure
      }
      return KanjiElementSummary(
        id: id,
        meanings: element.meanings,
        commonLinkedOnReadings: element.commonLinkedOnReadings,
        role: role
      )
    }
  }

  func entry(_ id: KanjiElementID) throws -> KanjiElementEntry? {
    let catalog = try catalog()
    guard let element = catalog.elementByGlyph[glyphKey(id.rawValue)] else { return nil }
    let contribution: (SourceKanjiElementKanji) -> KanjiElementContribution? = { record in
      guard let character = KanjiCharacter(record.character) else { return nil }
      return KanjiElementContribution(
        character: character,
        meanings: record.meanings,
        onReadings: record.onReadings,
        frequencyRank: record.frequencyRank
      )
    }
    let containingKanji = element.containingCharacters.compactMap {
      catalog.kanjiByCharacter[glyphKey($0)].flatMap(contribution)
    }
    let familyGlyphs = [id.rawValue] + element.alternatives
    let standalone = familyGlyphs
      .compactMap { catalog.kanjiByCharacter[glyphKey($0)].flatMap(contribution) }
      .sorted(by: contributionPrecedes)
      .first
    return KanjiElementEntry(
      id: id,
      meanings: element.meanings,
      onReadings: element.onReadings,
      commonLinkedOnReadings: element.commonLinkedOnReadings,
      alternatives: element.alternatives.compactMap { KanjiElementID($0) },
      standaloneKanji: standalone,
      containingKanji: containingKanji.filter { $0.character != standalone?.character },
      structureProvenance: KanjiElementProvenance(
        sourceIdentity: catalog.structureSourceIdentity,
        sourceSnapshot: catalog.snapshot,
        sourceRecordID: id.rawValue
      ),
      metadataProvenance: KanjiElementProvenance(
        sourceIdentity: catalog.metadataSourceIdentity,
        sourceSnapshot: catalog.metadataSourceSnapshot,
        sourceRecordID: id.rawValue
      )
    )
  }

  private func contributionPrecedes(
    _ lhs: KanjiElementContribution,
    _ rhs: KanjiElementContribution
  ) -> Bool {
    switch (lhs.frequencyRank, rhs.frequencyRank) {
    case let (left?, right?):
      if left != right { return left < right }
    case (_?, nil): return true
    case (nil, _?): return false
    case (nil, nil): break
    }
    return lhs.character.rawValue < rhs.character.rawValue
  }

  private func catalog() throws -> LoadedKanjiElementCatalog {
    if let loadedCatalog { return loadedCatalog }
    guard let url = Bundle.module.url(
      forResource: "KanjiElementReferenceData",
      withExtension: "json"
    ) else {
      throw KanjiElementReferenceDataError.missingBundledData
    }
    let source = try JSONDecoder().decode(
      SourceKanjiElementCatalog.self,
      from: Data(contentsOf: url)
    )
    let loaded = LoadedKanjiElementCatalog(
      snapshot: source.snapshot,
      structureSourceIdentity: source.structureSourceIdentity,
      metadataSourceIdentity: source.metadataSourceIdentity,
      metadataSourceSnapshot: source.metadataSourceSnapshot,
      elementByGlyph: Dictionary(
        uniqueKeysWithValues: source.elements.map { (glyphKey($0.glyph), $0) }
      ),
      kanjiByCharacter: Dictionary(
        uniqueKeysWithValues: source.kanji.map { (glyphKey($0.character), $0) }
      )
    )
    loadedCatalog = loaded
    return loaded
  }
}

private struct SourceKanjiElementCatalog: Decodable {
  let snapshot: String
  let structureSourceIdentity: String
  let metadataSourceIdentity: String
  let metadataSourceSnapshot: String
  let elements: [SourceKanjiElement]
  let kanji: [SourceKanjiElementKanji]
}

private struct SourceKanjiElement: Decodable {
  let glyph: String
  let alternatives: [String]
  let meanings: [String]
  let onReadings: [String]
  let commonLinkedOnReadings: [String]
  let containingCharacters: [String]
}

private struct SourceKanjiElementKanji: Decodable {
  let character: String
  let meanings: [String]
  let onReadings: [String]
  let frequencyRank: Int?
  let elementGlyphs: [String]
  let explicitPhoneticElement: String?
}

private struct LoadedKanjiElementCatalog {
  let snapshot: String
  let structureSourceIdentity: String
  let metadataSourceIdentity: String
  let metadataSourceSnapshot: String
  let elementByGlyph: [UInt32: SourceKanjiElement]
  let kanjiByCharacter: [UInt32: SourceKanjiElementKanji]
}

private func glyphKey(_ value: String) -> UInt32 {
  value.unicodeScalars.first!.value
}

private enum KanjiElementReferenceDataError: Error {
  case missingBundledData
}
