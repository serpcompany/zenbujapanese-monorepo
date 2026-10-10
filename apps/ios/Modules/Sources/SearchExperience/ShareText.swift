extension DictionaryEntry {
  var shareText: String {
    let heading = reading == headword ? headword : "\(headword)【\(reading)】"
    let meanings = senses.enumerated().map { "\($0.offset + 1). \($0.element.meaning)" }
    return ([heading] + meanings).joined(separator: "\n")
  }
}

extension KanjiReferenceEntry {
  static func shareText(for character: KanjiCharacter, reference: KanjiReferenceEntry?) -> String {
    guard let reference else { return character.rawValue }
    let readings = reference.readings.map(\.value).joined(separator: "、")
    let heading = readings.isEmpty ? character.rawValue : "\(character.rawValue)【\(readings)】"
    return [heading, reference.meanings.joined(separator: ", ")]
      .filter { !$0.isEmpty }
      .joined(separator: "\n")
  }
}
