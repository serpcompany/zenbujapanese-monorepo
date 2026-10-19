import Foundation

@testable import SearchExperience

extension FakeAccountService {
  func file(_ photoID: String, for email: String) -> Data? {
    lock.withLock { files[userID(for: email)]?[photoID] }
  }

  func setPhotosUnavailable(_ unavailable: Bool) {
    lock.withLock { photosUnavailable = unavailable }
  }

  func photoFile(_ request: StubRequest, for user: String) -> StubReply {
    let photoID = String(request.path.dropFirst("/v1/photos/".count))
    switch request.method {
    case "PUT":
      guard !photosUnavailable else { return .error(503, "photos_unavailable") }
      guard request.body.sha256 == photoID else { return .error(400, "photo_digest_mismatch") }
      let kept = files[user]?[photoID] != nil
      files[user, default: [:]][photoID] = request.body
      return .json(
        kept ? 200 : 201,
        ["id": photoID, "contentType": "image/jpeg", "byteSize": request.body.count])
    case "GET":
      guard let data = files[user]?[photoID] else { return .error(404, "not_found") }
      return .answer(status: 200, headers: ["Content-Type": "image/jpeg"], body: data)
    default:
      return .error(404, "not_found")
    }
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
      if current?.data != nil { return applied(version) }
      return save(
        user, key,
        ["id": entityID, "name": fields["name"] ?? "", "savedAt": fields["savedAt"] ?? ""],
        version + 1, applied)
    case (SyncEntity.photo, "delete"):
      guard current?.data != nil else { return applied(version) }
      return deletePhoto(entityID, version + 1, for: user, applied)
    case (SyncEntity.photoWord, "add"):
      let photoID = String(entityID.prefix { $0 != "/" })
      guard let photo = accounts[user]?["photo:\(photoID)"], photo.data != nil else {
        return StubSync.rejected(mutation.id, "unknown_photo")
      }
      if current?.data != nil { return applied(version) }
      _ = save(user, "photo:\(photoID)", photo.data, photo.version) { _ in [:] }
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
      let photoID = String(entityID.prefix { $0 != "/" })
      if mutation.entity == SyncEntity.photoWord, !hasWords(photoID, for: user),
        let photo = accounts[user]?["photo:\(photoID)"]
      {
        _ = deletePhoto(photoID, photo.version + 1, for: user) { _ in [:] }
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
      if current != nil, current?.data == nil, base != version { return conflict() }
      let sent = fields["searchedAt"] as? String ?? ""
      let kept = current?.data?["searchedAt"] as? String ?? ""
      let data: [String: Any] = [
        "id": entityID, "query": fields["query"] ?? "", "searchedAt": max(sent, kept),
      ]
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
    _ photoID: String, _ version: Int, for user: String, _ applied: (Int) -> [String: Any]
  ) -> [String: Any] {
    accounts[user] = accounts[user]?.filter { !$0.key.hasPrefix("photoWord:\(photoID)/") }
    if accounts[user]?["profilePhoto:\(user)"]?.data?["photoId"] as? String != photoID {
      files[user]?[photoID] = nil
    }
    return save(user, "photo:\(photoID)", nil, version, applied)
  }
}
