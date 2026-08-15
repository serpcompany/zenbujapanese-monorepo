import Foundation

struct DictionaryRankingArtifactContract: Decodable, Equatable {
  let policy: String
  let schemaVersion: String
  let databaseSHA256: String
  let databaseBytes: Int
  let mappingSHA256: String
  let evidenceCounts: EvidenceCounts
  let semanticEquivalence: SemanticEquivalence
  let searchIndex: SearchIndex
  let toolSHA256: ToolSHA256

  struct EvidenceCounts: Decodable, Equatable {
    let formPriorityProfiles: Int
    let canonicalSenses: Int
    let glossAtoms: Int
    let senseFormRestrictions: Int
    let readingFormRestrictions: Int

    enum CodingKeys: String, CodingKey {
      case formPriorityProfiles = "form_priority_profiles"
      case canonicalSenses = "canonical_senses"
      case glossAtoms = "gloss_atoms"
      case senseFormRestrictions = "sense_form_restrictions"
      case readingFormRestrictions = "reading_form_restrictions"
    }

    var tableCounts: [(String, Int)] {
      [
        ("form_priority_profiles", formPriorityProfiles),
        ("canonical_senses", canonicalSenses),
        ("gloss_atoms", glossAtoms),
        ("sense_form_restrictions", senseFormRestrictions),
        ("reading_form_restrictions", readingFormRestrictions),
      ]
    }
  }

  struct SemanticEquivalence: Decodable, Equatable {
    let normalization: String
    let duplicateGroups: Int
    let sourceRows: Int

    enum CodingKeys: String, CodingKey {
      case normalization
      case duplicateGroups = "duplicate_groups"
      case sourceRows = "source_rows"
    }
  }

  struct SearchIndex: Decodable, Equatable {
    let schema: String
    let technology: String
    let glossRows: Int
    let formRows: Int

    enum CodingKeys: String, CodingKey {
      case schema
      case technology
      case glossRows = "gloss_rows"
      case formRows = "form_rows"
    }
  }

  struct ToolSHA256: Decodable, Equatable {
    let importer: String
    let rankingAdapter: String
    let contractGenerator: String
    let sharedTooling: String
    let unidicAdapter: String
    let tatoebaAdapter: String

    enum CodingKeys: String, CodingKey {
      case importer = "import_tool_sha256"
      case rankingAdapter = "dictionary_ranking_adapter_sha256"
      case contractGenerator = "dictionary_ranking_contract_sha256"
      case sharedTooling = "shared_tooling_sha256"
      case unidicAdapter = "unidic_adapter_sha256"
      case tatoebaAdapter = "tatoeba_adapter_sha256"
    }

    var metadata: [(String, String)] {
      [
        (CodingKeys.importer.rawValue, importer),
        (CodingKeys.rankingAdapter.rawValue, rankingAdapter),
        (CodingKeys.contractGenerator.rawValue, contractGenerator),
        (CodingKeys.sharedTooling.rawValue, sharedTooling),
        (CodingKeys.unidicAdapter.rawValue, unidicAdapter),
        (CodingKeys.tatoebaAdapter.rawValue, tatoebaAdapter),
      ]
    }
  }

  static func bundled() throws -> Self {
    guard let url = Bundle.module.url(
      forResource: "DictionaryRankingArtifactContract",
      withExtension: "json"
    ) else {
      throw LookupDatabaseError.invalidDictionaryRankingMetadata
    }
    return try JSONDecoder().decode(Self.self, from: Data(contentsOf: url))
  }
}
