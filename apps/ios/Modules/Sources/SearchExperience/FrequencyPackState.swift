import Foundation

struct FrequencyPackDisclosure: Equatable, Sendable {
  let id: FrequencyPackID
  let kind: FrequencyPackKind
  let displayName: String
  let domain: String
  let domainDescription: String
  let version: String
  let attribution: String

  var shortName: String {
    switch id.rawValue.split(separator: ".").prefix(3).joined(separator: ".") {
    case "zenbu.tubelex.youtube": "YouTube"
    case "zenbu.wikipedia.written": "Wikipedia"
    case "zenbu.jlpt.waller": "JLPT"
    case "zenbu.jiten.video-games": "Games"
    default: displayName
    }
  }
}

struct FrequencyPackSnapshot: Equatable, Sendable {
  let enabledPackIDs: [FrequencyPackID]
  let packs: [FrequencyPackState]

  var enabledPacks: [FrequencyPackState] {
    enabledPackIDs.compactMap { id in packs.first { $0.id == id } }
  }
}

struct FrequencyPackState: Equatable, Identifiable, Sendable {
  var id: FrequencyPackID { manifest.packID }
  let manifest: FrequencyPackManifest
  let isInstalled: Bool
  let isEnabled: Bool
  let installedBytes: Int?
  let failureMessage: String?
  let updateStatus: String
  let updateAvailable: Bool

  var availableActions: [FrequencyPackAction] {
    guard isInstalled else { return [.download] }
    return [isEnabled ? .disable : .enable]
      + (updateAvailable ? [.update] : [])
      + (manifest.removable ? [.remove] : [])
  }
}

enum FrequencyPackAction: Equatable, Sendable {
  case download
  case enable
  case disable
  case update
  case remove

  var label: String {
    switch self {
    case .download: "Download"
    case .enable: "Enable"
    case .disable: "Disable"
    case .update: "Download Update"
    case .remove: "Remove Pack"
    }
  }
}

struct InstalledFrequencyPackRecord: Codable, Equatable, Sendable {
  let packID: FrequencyPackID
  let packVersion: String
  let manifestSHA256: String
  let artifactSHA256: String
}
