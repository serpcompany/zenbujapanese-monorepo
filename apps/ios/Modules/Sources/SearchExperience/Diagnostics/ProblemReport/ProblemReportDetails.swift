import AVFAudio
import Foundation

struct ProblemReportDetails: Equatable, Sendable {
  enum Permission: String, Equatable, Sendable {
    case allowed
    case denied
    case notAsked = "not asked"
    case restricted
  }

  struct Line: Equatable, Identifiable, Sendable {
    let label: String
    let value: String

    var id: String { label }
    var sent: String { "\(label): \(value)" }
  }

  var version: String
  var build: String
  var systemName: String
  var systemVersion: String
  var device: String
  var isSignedIn: Bool
  var sendsCrashReports: Bool
  var dictionaries: [String]
  var microphone: Permission
  var camera: Permission

  var lines: [Line] {
    [
      Line(label: "Version", value: "\(version) (\(build))"),
      Line(label: systemName, value: systemVersion),
      Line(label: "Device", value: device),
      Line(label: "Account", value: isSignedIn ? "Signed in" : "Signed out"),
      Line(label: "Crash Reports", value: sendsCrashReports ? "On" : "Off"),
      Line(
        label: "Dictionaries",
        value: dictionaries.isEmpty ? "None" : dictionaries.joined(separator: ", ")),
      Line(
        label: "Permissions",
        value: "Microphone \(microphone.rawValue), Camera \(camera.rawValue)"),
    ]
  }

  var permissions: [String: String] {
    ["microphone": microphone.rawValue, "camera": camera.rawValue]
  }
}

extension ProblemReportDetails {
  @MainActor
  static func current(
    isSignedIn: Bool, defaults: UserDefaults = .standard, bundle: Bundle = .main,
    packs: FrequencyPackClient = .live, camera: CameraAuthorizationClient = .live
  ) async -> ProblemReportDetails {
    let version = ProcessInfo.processInfo.operatingSystemVersion
    let installed = (try? await packs.snapshot().packs.filter(\.isInstalled)) ?? []
    return ProblemReportDetails(
      version: bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "",
      build: bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "",
      systemName: ThisDevice.systemName,
      systemVersion: [version.majorVersion, version.minorVersion]
        .map(String.init).joined(separator: ".")
        + (version.patchVersion > 0 ? ".\(version.patchVersion)" : ""),
      device: ThisDevice.model,
      isSignedIn: isSignedIn,
      sendsCrashReports: CrashReportingPolicy.sendsCrashReports(in: defaults),
      dictionaries: installed.map(\.manifest.displayName),
      microphone: microphonePermission(),
      camera: permission(camera.state()))
  }

  private static func microphonePermission() -> Permission {
    switch AVAudioApplication.shared.recordPermission {
    case .granted: .allowed
    case .denied: .denied
    case .undetermined: .notAsked
    @unknown default: .restricted
    }
  }

  private static func permission(_ state: CameraAuthorizationState) -> Permission {
    switch state {
    case .authorized: .allowed
    case .denied: .denied
    case .notDetermined: .notAsked
    case .restricted: .restricted
    }
  }
}
