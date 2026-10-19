import Foundation

extension SyncEntity {
  static let wordNote = "wordNote"
  static let photo = "photo"
  static let photoWord = "photoWord"
  static let profilePhoto = "profilePhoto"
  static let setting = "setting"
  static let recentSearch = "recentSearch"

  static let kept = [wordNote, photo, photoWord, profilePhoto, setting, recentSearch]
  static let replacedWhileUnsent: Set<String> = [watchedVideo, wordNote, setting, recentSearch]
  static let needFiles: Set<String> = [photo, photoWord, profilePhoto]
}

struct KeptNote: Codable, Hashable, Sendable {
  let id: String
  let item: String
  let text: String
  let headword: String?
  let reading: String?
}

struct KeptPhoto: Codable, Hashable, Sendable {
  let id: String
  let name: String
  let savedAt: Date
}

struct KeptPhotoWord: Codable, Hashable, Sendable {
  let photoID: String
  let item: String
  let headword: String
  let reading: String
  let savedAt: Date
}

struct KeptSearch: Codable, Hashable, Sendable {
  let query: String
  let searchedAt: Date
}

enum KeptValue: Codable, Hashable, Sendable {
  case note(KeptNote)
  case photo(KeptPhoto)
  case photoWord(KeptPhotoWord)
  case profilePhoto(String)
  case setting(name: String, value: SyncFieldValue)
  case recentSearch(KeptSearch)

  init?(entity: String, entityID: String, data: KeptData) {
    switch entity {
    case SyncEntity.wordNote:
      guard let id = data.id, id.lowercased() == entityID.lowercased(), let item = data.itemId,
        let text = data.text
      else { return nil }
      self = .note(
        KeptNote(
          id: id.lowercased(), item: item, text: text, headword: data.headword,
          reading: data.reading))
    case SyncEntity.photo:
      guard data.id == entityID, let name = data.name, let savedAt = data.savedAt else {
        return nil
      }
      self = .photo(KeptPhoto(id: entityID, name: name, savedAt: savedAt))
    case SyncEntity.photoWord:
      guard let photoID = data.photoId, let item = data.itemId, let headword = data.headword,
        let savedAt = data.savedAt, entityID == KeptChanges.photoWordID(photoID, item)
      else { return nil }
      self = .photoWord(
        KeptPhotoWord(
          photoID: photoID, item: item, headword: headword, reading: data.reading ?? "",
          savedAt: savedAt))
    case SyncEntity.profilePhoto:
      guard let photoID = data.photoId else { return nil }
      self = .profilePhoto(photoID)
    case SyncEntity.setting:
      guard data.name == entityID, let value = data.value else { return nil }
      self = .setting(name: entityID, value: value)
    case SyncEntity.recentSearch:
      guard let query = data.query, let searchedAt = data.searchedAt else { return nil }
      self = .recentSearch(KeptSearch(query: query, searchedAt: searchedAt))
    default:
      return nil
    }
  }
}

struct KeptData: Decodable, Sendable {
  let id: String?
  let itemId: String?
  let text: String?
  let headword: String?
  let reading: String?
  let name: String?
  let savedAt: Date?
  let photoId: String?
  let value: SyncFieldValue?
  let query: String?
  let searchedAt: Date?
}

struct KeptLocalChange: Sendable, Equatable {
  let key: SyncEntityKey
  let operation: String
  var fields: [String: SyncFieldValue]? = nil
  var startedFrom: String? = nil
}

enum KeptChanges {
  static func photoWordID(_ photoID: String, _ item: String) -> String { "\(photoID)/\(item)" }

  static func searchID(_ query: String, under key: String) -> String? {
    Data(hexString: key).map { Data(query.precomposedStringWithCanonicalMapping.utf8).hmacSHA256(under: $0) }
  }

  static func search(_ change: KeptLocalChange, under key: String) -> KeptLocalChange? {
    guard let id = searchID(change.key.entityID, under: key) else { return nil }
    return KeptLocalChange(
      key: SyncEntityKey(entity: SyncEntity.recentSearch, entityID: id),
      operation: change.operation, fields: change.fields)
  }

  static func noteWritten(_ note: KeptNote, startedFrom: String?) -> KeptLocalChange {
    var fields: [String: SyncFieldValue] = ["item": .string(note.item), "text": .string(note.text)]
    if let headword = note.headword { fields["headword"] = .string(headword) }
    if let reading = note.reading { fields["reading"] = .string(reading) }
    return KeptLocalChange(
      key: SyncEntityKey(entity: SyncEntity.wordNote, entityID: note.id.lowercased()),
      operation: "write", fields: fields, startedFrom: startedFrom)
  }

  static func noteDeleted(_ id: String) -> KeptLocalChange {
    KeptLocalChange(
      key: SyncEntityKey(entity: SyncEntity.wordNote, entityID: id.lowercased()),
      operation: "delete")
  }

  static func photoAdded(_ photo: KeptPhoto) -> KeptLocalChange {
    KeptLocalChange(
      key: SyncEntityKey(entity: SyncEntity.photo, entityID: photo.id), operation: "add",
      fields: ["name": .string(photo.name), "savedAt": moment(photo.savedAt)])
  }

  static func photoDeleted(_ id: String) -> KeptLocalChange {
    KeptLocalChange(key: SyncEntityKey(entity: SyncEntity.photo, entityID: id), operation: "delete")
  }

  static func photoWordAdded(_ word: KeptPhotoWord) -> KeptLocalChange {
    KeptLocalChange(
      key: photoWordKey(word.photoID, word.item), operation: "add",
      fields: [
        "headword": .string(word.headword), "reading": .string(word.reading),
        "savedAt": moment(word.savedAt),
      ])
  }

  static func photoWordRemoved(_ photoID: String, _ item: String) -> KeptLocalChange {
    KeptLocalChange(key: photoWordKey(photoID, item), operation: "remove")
  }

  static func profilePhotoSet(_ photoID: String) -> KeptLocalChange {
    KeptLocalChange(
      key: profilePhotoKey, operation: "set", fields: ["photoId": .string(photoID)])
  }

  static let profilePhotoRemoved = KeptLocalChange(key: profilePhotoKey, operation: "remove")

  static func settingSet(_ name: String, _ value: SyncFieldValue) -> KeptLocalChange {
    KeptLocalChange(
      key: SyncEntityKey(entity: SyncEntity.setting, entityID: name), operation: "set",
      fields: ["value": value])
  }

  static func searched(_ search: KeptSearch) -> KeptLocalChange {
    KeptLocalChange(
      key: SyncEntityKey(entity: SyncEntity.recentSearch, entityID: search.query),
      operation: "search",
      fields: ["query": .string(search.query), "searchedAt": moment(search.searchedAt)])
  }

  static func searchRemoved(_ query: String) -> KeptLocalChange {
    KeptLocalChange(
      key: SyncEntityKey(entity: SyncEntity.recentSearch, entityID: query), operation: "remove")
  }

  static let profilePhotoKey = SyncEntityKey(entity: SyncEntity.profilePhoto, entityID: "")

  static func photoWordKey(_ photoID: String, _ item: String) -> SyncEntityKey {
    SyncEntityKey(entity: SyncEntity.photoWord, entityID: photoWordID(photoID, item))
  }

  static func moment(_ date: Date) -> SyncFieldValue {
    .string(Date.ISO8601FormatStyle(includingFractionalSeconds: true).format(date))
  }
}

final class KeptChangeRelay: @unchecked Sendable {
  private let lock = NSLock()
  private var observer: (@MainActor @Sendable (KeptLocalChange) -> Void)?

  func observe(_ observer: @escaping @MainActor @Sendable (KeptLocalChange) -> Void) {
    lock.withLock { self.observer = observer }
  }

  func post(_ change: KeptLocalChange) async {
    guard let observer = lock.withLock({ observer }) else { return }
    await MainActor.run { observer(change) }
  }
}
