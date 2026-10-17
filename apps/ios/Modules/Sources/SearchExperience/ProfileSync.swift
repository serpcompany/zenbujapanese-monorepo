import Foundation

struct ProfileFields: Codable, Hashable, Sendable {
  var name: String?
  var username: String?

  var isEmpty: Bool { name == nil && username == nil }

  var uploadable: ProfileFields {
    ProfileFields(
      name: name.flatMap { UserProfile.isAccountName($0) ? $0 : nil },
      username: username.flatMap {
        $0.isEmpty || UserProfile.acceptedUsername($0) == $0 ? $0 : nil
      })
  }

  var eachField: [ProfileFields] {
    [name.map { ProfileFields(name: $0) }, username.map { ProfileFields(username: $0) }]
      .compactMap { $0 }
  }

  var syncFields: [String: SyncFieldValue] {
    var fields: [String: SyncFieldValue] = [:]
    if let name { fields["name"] = .string(name) }
    if let username { fields["username"] = username.isEmpty ? .null : .string(username) }
    return fields
  }

  func limited(to other: ProfileFields) -> ProfileFields {
    ProfileFields(
      name: other.name == nil ? nil : name, username: other.username == nil ? nil : username)
  }
}

struct SyncedProfile: Decodable, Sendable {
  let id: String
  let name: String
  let username: String?
  let version: Int

  var fields: ProfileFields { ProfileFields(name: name, username: username ?? "") }
}

struct FirstProfileSync: Sendable {
  let onDevice: ProfileFields
  let uploads: [ProfileFields]

  init(device: ProfileFields, account: ProfileFields, fillsAccount: Bool = true) {
    let name = Self.filled(account.name, from: fillsAccount ? device.name : nil)
    let username = Self.filled(account.username, from: fillsAccount ? device.username : nil)
    onDevice = ProfileFields(name: name, username: username)
    let filled = ProfileFields(
      name: name == account.name ? nil : name,
      username: username == account.username ? nil : username)
    uploads = filled.uploadable.eachField
  }

  private static func filled(_ account: String?, from device: String?) -> String {
    guard let account, !account.isEmpty else { return device ?? "" }
    return account
  }
}

enum ProfileRefusal: Equatable, Sendable {
  case usernameTaken
  case other

  init(code: String) {
    self = code == "username_taken" ? .usernameTaken : .other
  }
}

extension AccountSyncState {
  var profileKey: SyncEntityKey {
    SyncEntityKey(entity: SyncEntity.profile, entityID: (account ?? signedOutFrom)?.userID ?? "")
  }

  var knowsProfile: Bool { versions[profileKey.stored] != nil }

  func holds(_ key: SyncEntityKey) -> Bool {
    key.entity == SyncEntity.profile && !knowsProfile
  }

  mutating func handOn(_ restored: ProfileFields, from key: SyncEntityKey) -> ProfileFields {
    var unclaimed = restored
    for index in queue.indices where queue[index].key == key {
      guard case .restoreProfile(var later) = queue[index].undo else { continue }
      if let name = unclaimed.name, queue[index].fields?["name"] != nil {
        later.name = name
        unclaimed.name = nil
      }
      if let username = unclaimed.username, queue[index].fields?["username"] != nil {
        later.username = username
        unclaimed.username = nil
      }
      queue[index].undo = .restoreProfile(later)
    }
    return unclaimed
  }

  mutating func takeFirst(_ account: SyncedProfile, over device: ProfileFields) -> ProfileFields {
    let key = profileKey
    queue.removeAll { $0.key == key }
    deferred[key.stored] = nil
    setVersion(account.version, of: key, gone: false)
    let first = FirstProfileSync(
      device: device, account: account.fields, fillsAccount: !takesAccountProfile)
    takesAccountProfile = false
    queue += first.uploads.map { upload in
      QueuedSyncChange(
        id: UUID().uuidString.lowercased(), key: key, operation: "update",
        baseVersion: account.version, fields: upload.syncFields,
        undo: .restoreProfile(account.fields.limited(to: upload)))
    }
    return first.onDevice
  }
}
