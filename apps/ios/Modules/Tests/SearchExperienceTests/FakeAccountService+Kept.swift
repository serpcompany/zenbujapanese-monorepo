import CryptoKit
import Foundation

@testable import SearchExperience

extension FakeAccountService {
  func file(_ photoID: String, for email: String) -> Data? {
    lock.withLock { files[userID(for: email)]?[photoID] }
  }

  func loseFile(_ photoID: String, for email: String) {
    lock.withLock { files[userID(for: email)]?[photoID] = nil }
  }

  func restoreFile(_ data: Data, for email: String) {
    lock.withLock { files[userID(for: email), default: [:]][data.sha256] = data }
  }

  func setPhotosUnavailable(_ unavailable: Bool) {
    lock.withLock { photosUnavailable = unavailable }
  }

  func refuseFiles(_ refusal: StubReply?, on method: String = "PUT") {
    lock.withLock { fileRefusals[method] = refusal }
  }

  func searchKey(of user: String) -> SHA256.Digest {
    SHA256.hash(data: Data("search key of \(user)".utf8))
  }

  func searchID(_ query: String, for email: String) -> String {
    lock.withLock { searchID(query, of: userID(for: email)) }
  }

  private func searchID(_ query: String, of user: String) -> String {
    HMAC<SHA256>.authenticationCode(
      for: Data(query.precomposedStringWithCanonicalMapping.utf8),
      using: SymmetricKey(data: searchKey(of: user))
    ).hexString
  }

  func photoFile(_ request: StubRequest, for user: String) -> StubReply {
    let photoID = String(request.path.dropFirst("/v1/photos/".count))
    switch request.method {
    case "PUT":
      guard !photosUnavailable else { return .error(503, "photos_unavailable") }
      if let refusal = fileRefusals[request.method] { return refusal }
      guard request.body.sha256 == photoID else { return .error(400, "photo_digest_mismatch") }
      let kept = files[user]?[photoID] != nil
      files[user, default: [:]][photoID] = request.body
      return .json(
        kept ? 200 : 201,
        ["id": photoID, "contentType": "image/jpeg", "byteSize": request.body.count])
    case "GET":
      if let refusal = fileRefusals[request.method] { return refusal }
      guard let data = files[user]?[photoID] else {
        return .error(404, names(photoID, for: user) ? "photo_file_missing" : "not_found")
      }
      return .answer(status: 200, headers: ["Content-Type": "image/jpeg"], body: data)
    default:
      return .error(404, "not_found")
    }
  }

  private func names(_ photoID: String, for user: String) -> Bool {
    accounts[user]?["photo:\(photoID)"]?.data != nil || emptiedPhotos[user]?[photoID] != nil
      || accounts[user]?["profilePhoto:\(user)"]?.data?["photoId"] as? String == photoID
  }

  func applyKept(_ mutation: StubSyncRequest.Mutation, for user: String) -> [String: Any] {
    let entityID = mutation.entity == SyncEntity.profilePhoto ? user : mutation.entityId
    let key = "\(mutation.entity):\(entityID)"
    let current = accounts[user]?[key]
    let version = current?.version ?? 0
    let base = mutation.baseVersion ?? 0
    let fields = (mutation.fields ?? [:]).mapValues(Self.json)
    let (applied, conflict) = outcomes(of: mutation, key: key, current: current)
    let same = { (data: [String: Any]?) in
      NSDictionary(dictionary: data ?? [:]).isEqual(to: current?.data ?? [:])
    }
    let photoID = String(entityID.prefix { $0 != "/" })
    switch (mutation.entity, mutation.operation) {
    case (SyncEntity.wordNote, "write"):
      let data: [String: Any] = [
        "id": entityID, "itemId": fields["item"] ?? "", "text": fields["text"] ?? "",
        "headword": fields["headword"] ?? NSNull(), "reading": fields["reading"] ?? NSNull(),
      ]
      if current?.data != nil {
        if same(data) { return applied(version) }
        guard base == version else { return conflict() }
      }
      return save(user, key, data, version + 1, applied)
    case (SyncEntity.photo, "add"):
      guard files[user]?[entityID] != nil else {
        return StubSync.rejected(mutation.id, AccountSync.photoNotUploaded)
      }
      emptiedPhotos[user]?[entityID] = nil
      if current?.data != nil { return applied(version) }
      return save(
        user, key,
        ["id": entityID, "name": fields["name"] ?? "", "savedAt": fields["savedAt"] ?? ""],
        version + 1, applied)
    case (SyncEntity.photo, "delete"):
      guard names(entityID, for: user) else { return applied(version) }
      return deletePhoto(entityID, for: user, applied)
    case (SyncEntity.photoWord, "add"):
      guard let photo = accounts[user]?["photo:\(photoID)"] else {
        return StubSync.rejected(mutation.id, AccountSync.unknownPhoto)
      }
      if current?.data != nil { return applied(version) }
      if photo.data == nil {
        guard let emptied = emptiedPhotos[user]?.removeValue(forKey: photoID) else {
          return StubSync.rejected(mutation.id, AccountSync.unknownPhoto)
        }
        _ = save(user, "photo:\(photoID)", emptied, photo.version + 1) { _ in [:] }
      } else {
        _ = save(user, "photo:\(photoID)", photo.data, photo.version) { _ in [:] }
      }
      return save(
        user, key,
        [
          "photoId": photoID, "itemId": String(entityID.drop { $0 != "/" }.dropFirst()),
          "headword": fields["headword"] ?? "", "reading": fields["reading"] ?? "",
          "savedAt": fields["savedAt"] ?? "",
        ], version + 1, applied)
    case (SyncEntity.photoWord, "remove"), (SyncEntity.wordNote, "delete"):
      guard current?.data != nil else { return applied(version) }
      guard base == version else { return conflict() }
      let result = save(user, key, nil, version + 1, applied)
      if mutation.entity == SyncEntity.photoWord, !hasWords(photoID, for: user),
        let photo = accounts[user]?["photo:\(photoID)"], let data = photo.data
      {
        emptiedPhotos[user, default: [:]][photoID] = data
        _ = save(user, "photo:\(photoID)", nil, photo.version + 1) { _ in [:] }
      }
      return result
    case (SyncEntity.profilePhoto, _):
      let photoID = fields["photoId"] as? String
      if current?.data?["photoId"] as? String == photoID { return applied(version) }
      guard base == version else { return conflict() }
      if let photoID, files[user]?[photoID] == nil {
        return StubSync.rejected(mutation.id, AccountSync.photoNotUploaded)
      }
      return save(user, key, photoID.map { ["photoId": $0] }, version + 1, applied)
    case (SyncEntity.setting, "set"):
      let data: [String: Any] = ["name": entityID, "value": fields["value"] ?? NSNull()]
      if same(data) { return applied(version) }
      guard base == version else { return conflict() }
      return save(user, key, data, version + 1, applied)
    case (SyncEntity.recentSearch, "search"):
      let query = fields["query"] as? String ?? ""
      guard searchID(query, of: user) == entityID else {
        return StubSync.rejected(mutation.id, "invalid_mutation")
      }
      if current != nil, current?.data == nil, base != version { return conflict() }
      let sent = fields["searchedAt"] as? String ?? ""
      let kept = current?.data?["searchedAt"] as? String ?? ""
      let data: [String: Any] = ["id": entityID, "query": query, "searchedAt": max(sent, kept)]
      if same(data) { return applied(version) }
      return save(user, key, data, version + 1, applied)
    case (SyncEntity.recentSearch, "remove"):
      guard current?.data != nil else { return applied(version) }
      return save(user, key, nil, version + 1, applied)
    default:
      return StubSync.rejected(mutation.id, "unknown_operation")
    }
  }

  private func hasWords(_ photoID: String, for user: String) -> Bool {
    (accounts[user] ?? [:]).contains { $0.key.hasPrefix("photoWord:\(photoID)/") && $0.value.data != nil }
  }

  private func deletePhoto(
    _ photoID: String, for user: String, _ applied: (Int) -> [String: Any]
  ) -> [String: Any] {
    emptiedPhotos[user]?[photoID] = nil
    for (key, word) in accounts[user] ?? [:]
    where key.hasPrefix("photoWord:\(photoID)/") && word.data != nil {
      _ = save(user, key, nil, word.version + 1) { _ in [:] }
    }
    if accounts[user]?["profilePhoto:\(user)"]?.data?["photoId"] as? String != photoID {
      files[user]?[photoID] = nil
    }
    let version = accounts[user]?["photo:\(photoID)"]?.version ?? 0
    return save(user, "photo:\(photoID)", nil, version + 1, applied)
  }
}
