import Foundation

struct CrashReportingBuild: Equatable, Sendable {
  let dsn: String
  let environment: String

  var allowsTestSwitches: Bool { environment == CrashReportingPolicy.qaEnvironment }
}

enum CrashReportingPolicy {
  static let destinationInfoKey = "ZenbuCrashReportsDSN"
  static let testConfigurationKey = "XCTestConfigurationFilePath"
  static let qaEnvironment = "qa"
  static let productionEnvironment = "production"
  static let preferenceKey = "crash-reports.send"
  static let installIDKey = "crash-reports.install-id"
  static let breadcrumbPrefix = "zenbu."

  static let keptContexts: Set<String> = ["app", "device", "os", "runtime", "trace", "problem"]
  static let problemReportContexts: Set<String> = ["report", "permissions"]
  static let flushTimeout: TimeInterval = 15

  static let droppedContextFields: [String: Set<String>] = [
    "app": ["device_app_hash"],
    "device": ["locale", "timezone", "name"],
  ]

  static let emailPattern =
    #"(?:\G|(?<![\p{L}\p{M}\p{N}._%+'\-]))[\p{L}\p{M}\p{N}._%+'\-]++@[\p{L}\p{M}\p{N}.\-]+\.\p{L}[\p{L}\p{M}]+"#

  static func build(
    info: [String: Any]?, bundleID: String?, environment: [String: String]
  ) -> CrashReportingBuild? {
    guard environment[testConfigurationKey] == nil,
      bundleID?.hasSuffix(LaunchHarness.uiTestBundleSuffix) != true,
      let dsn = (info?[destinationInfoKey] as? String)?
        .trimmingCharacters(in: .whitespacesAndNewlines),
      dsn.hasPrefix("https://")
    else { return nil }
    let suffix = (info?[AccountServiceConfiguration.bundleIDSuffixKey] as? String)?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return CrashReportingBuild(
      dsn: dsn, environment: suffix.isEmpty ? productionEnvironment : qaEnvironment)
  }

  static func sendsCrashReports(in defaults: UserDefaults) -> Bool {
    defaults.object(forKey: preferenceKey) as? Bool ?? true
  }

  static func installID(defaults: UserDefaults) -> String {
    if let id = defaults.string(forKey: installIDKey), UUID(uuidString: id) != nil { return id }
    let id = UUID().uuidString
    defaults.set(id, forKey: installIDKey)
    return id
  }

  static func cacheDirectory(caches: String, bundleID: String) -> String {
    ((caches as NSString).appendingPathComponent(bundleID) as NSString)
      .appendingPathComponent("Sentry")
  }

  static func problemReportsDirectory(besides cacheDirectory: String) -> String {
    ((cacheDirectory as NSString).deletingLastPathComponent as NSString)
      .appendingPathComponent("Problem Reports")
  }

  static func hasQueuedReports(in directory: String, fileManager: FileManager = .default) -> Bool {
    !queuedReports(in: directory, fileManager: fileManager).isEmpty
  }

  static func moveQueuedReports(
    from source: String, to target: String, fileManager: FileManager = .default,
    where moves: ((Data) -> Bool)? = nil
  ) {
    for path in queuedReports(in: source, fileManager: fileManager) {
      let origin = (source as NSString).appendingPathComponent(path)
      if let moves, !moves(fileManager.contents(atPath: origin) ?? Data()) { continue }
      let destination = (target as NSString).appendingPathComponent(path)
      try? fileManager.createDirectory(
        atPath: (destination as NSString).deletingLastPathComponent,
        withIntermediateDirectories: true)
      try? fileManager.moveItem(atPath: origin, toPath: destination)
    }
  }

  private static func queuedReports(in directory: String, fileManager: FileManager) -> [String] {
    guard let paths = fileManager.enumerator(atPath: directory) else { return [] }
    return paths.compactMap { $0 as? String }.filter { path in
      ((path as NSString).deletingLastPathComponent as NSString).lastPathComponent == "envelopes"
    }
  }

  static func keepsBreadcrumb(category: String) -> Bool {
    category.hasPrefix(breadcrumbPrefix)
  }
}
