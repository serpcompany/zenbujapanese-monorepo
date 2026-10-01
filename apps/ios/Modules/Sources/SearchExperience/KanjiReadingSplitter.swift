import Foundation

enum KanjiReadingSplitter {
  static func split(_ kanji: String, reading: String) -> [String]? {
    let characters = Array(kanji)
    let target = hiragana(reading)
    var found: [[String]] = []
    var current: [String] = []

    func search(_ index: Int, _ position: Int, previous: Character?) {
      guard found.count < 2 else { return }
      guard index < characters.count else {
        if position == target.count { found.append(current) }
        return
      }
      let character = characters[index]
      let source = character == "々" ? previous : character
      guard let source, let candidates = variants[source] else { return }
      for candidate in candidates where target[position...].starts(with: candidate) {
        current.append(String(target[position..<(position + candidate.count)]))
        search(index + 1, position + candidate.count, previous: source)
        current.removeLast()
      }
    }

    search(0, 0, previous: nil)
    guard found.count == 1, let split = found.first else { return nil }
    let original = Array(reading)
    var offset = 0
    return split.map { piece in
      defer { offset += piece.count }
      return String(original[offset..<(offset + piece.count)])
    }
  }

  static func prepare() {
    _ = variants
  }

  private static let variants: [Character: [[Character]]] = {
    guard let url = Bundle.module.url(forResource: "KanjiReferenceData", withExtension: "json"),
      let data = try? Data(contentsOf: url),
      let catalog = try? JSONDecoder().decode(Catalog.self, from: data)
    else { return [:] }
    var result: [Character: [[Character]]] = [:]
    for entry in catalog.entries {
      guard let character = entry.character.first else { continue }
      var forms = Set<String>()
      for reading in entry.readings where reading.kind != "name" {
        let base = String(
          hiragana(reading.value).filter { $0 != "-" }.split(separator: ".").first ?? [])
        guard let first = base.first else { continue }
        var stems: Set<String> = [base]
        for changed in soundChanges[first] ?? [] {
          stems.insert(String(changed) + base.dropFirst())
        }
        for stem in stems {
          forms.insert(stem)
          if stem.count > 1, let last = stem.last, "つちくき".contains(last) {
            forms.insert(stem.dropLast() + "っ")
          }
        }
      }
      result[character] = forms.map(Array.init).sorted { $0.count > $1.count }
    }
    return result
  }()

  private static func hiragana(_ value: String) -> [Character] {
    value.map { character in
      guard let scalar = character.unicodeScalars.first, character.unicodeScalars.count == 1,
        (0x30A1...0x30F6).contains(scalar.value),
        let shifted = Unicode.Scalar(scalar.value - 0x60)
      else { return character }
      return Character(shifted)
    }
  }

  private static let soundChanges: [Character: [Character]] = [
    "か": ["が"], "き": ["ぎ"], "く": ["ぐ"], "け": ["げ"], "こ": ["ご"],
    "さ": ["ざ"], "し": ["じ"], "す": ["ず"], "せ": ["ぜ"], "そ": ["ぞ"],
    "た": ["だ"], "ち": ["ぢ", "じ"], "つ": ["づ", "ず"], "て": ["で"], "と": ["ど"],
    "は": ["ば", "ぱ"], "ひ": ["び", "ぴ"], "ふ": ["ぶ", "ぷ"], "へ": ["べ", "ぺ"], "ほ": ["ぼ", "ぽ"],
  ]

  private struct Catalog: Decodable {
    struct Entry: Decodable {
      struct Reading: Decodable {
        let value: String
        let kind: String
      }
      let character: String
      let readings: [Reading]
    }
    let entries: [Entry]
  }
}
