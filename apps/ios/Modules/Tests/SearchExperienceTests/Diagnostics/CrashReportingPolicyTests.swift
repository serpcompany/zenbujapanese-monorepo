import Foundation
import Sentry
import Testing

@testable import SearchExperience

@Suite("Crash reporting policy")
struct CrashReportingPolicyTests {
  private let dsn = "https://key@o1.ingest.us.sentry.io/2"
  private let appID = "com.zenbujapanese.dictionary"

  private func build(
    _ info: [String: Any], bundleID: String? = "com.zenbujapanese.dictionary",
    environment: [String: String] = [:], source: BuildSource = .storeSignature
  ) -> CrashReportingBuild? {
    CrashReportingPolicy.build(
      info: info, bundleID: bundleID, environment: environment, source: source)
  }

  @Test("only a Release build, which carries a destination, reports")
  func onlyABuildWithADestinationReports() {
    #expect(build(["ZenbuCrashReportsDSN": dsn])?.dsn == dsn)
    #expect(build(["ZenbuCrashReportsDSN": ""]) == nil)
    #expect(build(["ZenbuCrashReportsDSN": "$(ZENBU_CRASH_REPORTS_DSN)"]) == nil)
    #expect(build(["ZenbuCrashReportsDSN": "http://key@example.com/2"]) == nil)
    #expect(build([:]) == nil)
  }

  @Test("the unit-test and UI-test hosts never report, even with a destination")
  func testHostsNeverReport() {
    let info: [String: Any] = ["ZenbuCrashReportsDSN": dsn]
    #expect(build(info, environment: ["XCTestConfigurationFilePath": "/tmp/x.xctestconfiguration"]) == nil)
    #expect(build(info, bundleID: "com.zenbujapanese.dictionary.uitests") == nil)
    #expect(build(info, bundleID: "com.zenbujapanese.dictionary.dev") != nil)
  }

  @Test("Zenbu Dev reports as qa, and TestFlight and the App Store, which carry no provisioning profile, as production")
  func environments() {
    #expect(build(["ZenbuCrashReportsDSN": dsn, "ZenbuBundleIDSuffix": ".dev"])?.environment == "qa")
    #expect(build(["ZenbuCrashReportsDSN": dsn, "ZenbuBundleIDSuffix": ""])?.environment == "production")
    #expect(build(["ZenbuCrashReportsDSN": dsn])?.environment == "production")
  }

  @Test("a developer's Release build on the Simulator or with a provisioning profile reports as qa")
  func developersReleaseBuildsReportAsQA() {
    let release: [String: Any] = ["ZenbuCrashReportsDSN": dsn]
    for source in [BuildSource.simulator, .provisioningProfile] {
      #expect(build(release, source: source)?.environment == "qa")
      #expect(build(release, source: source)?.allowsTestSwitches == true)
      #expect(build(release, environment: ["XCTestConfigurationFilePath": "/tmp/x"], source: source) == nil)
      #expect(build(["ZenbuCrashReportsDSN": ""], source: source) == nil)
    }
  }

  @Test("Zenbu Dev reports as qa from every source, and a Mac Release build as production")
  func everySourcesEnvironment() {
    let zenbuDev: [String: Any] = ["ZenbuCrashReportsDSN": dsn, "ZenbuBundleIDSuffix": ".dev"]
    for source in [BuildSource.simulator, .provisioningProfile, .storeSignature, .mac] {
      #expect(build(zenbuDev, source: source)?.environment == "qa")
    }
    #expect(build(["ZenbuCrashReportsDSN": dsn], source: .mac)?.environment == "production")
  }

  @Test("a bundle carries a provisioning profile when embedded.mobileprovision is at its root")
  func provisioningProfileIsAtTheBundlesRoot() throws {
    let bundle = FileManager.default.temporaryDirectory
      .appendingPathComponent("crash-reporting-\(UUID().uuidString).app")
    try FileManager.default.createDirectory(at: bundle, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: bundle) }
    #expect(!CrashReportingPolicy.carriesProvisioningProfile(bundleAt: bundle))
    try Data().write(to: bundle.appendingPathComponent("embedded.mobileprovision"))
    #expect(CrashReportingPolicy.carriesProvisioningProfile(bundleAt: bundle))
  }

  @Test("this build's source is the Simulator on the Simulator, and the Mac on the Mac")
  func thisBuildsSource() {
    let onSimulator = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] != nil
    let expected: BuildSource =
      ThisDevice.name == "Mac" ? .mac : onSimulator ? .simulator : .provisioningProfile
    #expect(CrashReportingPlatform.source(of: .main) == expected)
  }

  @Test("only a qa build takes the test switches")
  func onlyQABuildsTakeTestSwitches() {
    #expect(CrashReportingBuild(dsn: dsn, environment: "qa").allowsTestSwitches)
    #expect(!CrashReportingBuild(dsn: dsn, environment: "production").allowsTestSwitches)
  }

  @Test("the offline switch gives Sentry a connection that never reaches the network")
  func offlineSwitchCutsTheConnection() async throws {
    let defaults = MemoryDefaults()
    #expect(CrashReportTest.offlineSession(defaults: defaults) == nil)
    defaults.set(true, forKey: CrashReportTest.offlineKey)
    let session = try #require(CrashReportTest.offlineSession(defaults: defaults))
    let envelope = try #require(URL(string: "https://o1.ingest.us.sentry.io/api/2/envelope/"))
    do {
      _ = try await session.data(for: URLRequest(url: envelope))
      Issue.record("the offline session reached the network")
    } catch {
      #expect((error as? URLError)?.code == .notConnectedToInternet)
    }
  }

  @Test("crash reports are on until the switch turns them off")
  func onUntilTurnedOff() throws {
    let defaults = MemoryDefaults()
    #expect(CrashReportingPolicy.sendsCrashReports(in: defaults))
    defaults.set(false, forKey: CrashReportingPolicy.preferenceKey)
    #expect(!CrashReportingPolicy.sendsCrashReports(in: defaults))
    defaults.set(true, forKey: CrashReportingPolicy.preferenceKey)
    #expect(CrashReportingPolicy.sendsCrashReports(in: defaults))
  }

  @Test("the install ID is a random UUID made once and kept")
  func installIDIsMadeOnceAndKept() throws {
    let defaults = MemoryDefaults()
    let id = CrashReportingPolicy.installID(defaults: defaults)
    #expect(UUID(uuidString: id) != nil)
    #expect(CrashReportingPolicy.installID(defaults: defaults) == id)
    defaults.set("not a uuid", forKey: CrashReportingPolicy.installIDKey)
    let replaced = CrashReportingPolicy.installID(defaults: defaults)
    #expect(replaced != "not a uuid")
    #expect(UUID(uuidString: replaced) != nil)
  }

  @Test("Sentry keeps its files in a folder of the app's own")
  func cacheFolderIsTheAppsOwn() {
    #expect(
      CrashReportingPolicy.cacheDirectory(caches: "/Caches", bundleID: appID)
        == "/Caches/com.zenbujapanese.dictionary/Sentry")
  }

  @Test("only breadcrumbs the app leaves itself are kept")
  func onlyTheAppsOwnBreadcrumbs() {
    #expect(CrashReportingPolicy.keepsBreadcrumb(category: "zenbu.sync"))
    #expect(!CrashReportingPolicy.keepsBreadcrumb(category: "ui.click"))
    #expect(!CrashReportingPolicy.keepsBreadcrumb(category: "http"))
  }

  @Test("a build with no destination never starts Sentry, the switch can't start it, and it can't send a report")
  @MainActor
  func noDestinationNeverStarts() throws {
    let defaults = MemoryDefaults()
    defaults.set(true, forKey: CrashReportTest.crashKey)
    CrashReporter.startAtLaunch(
      defaults: defaults, bundle: .main, environment: ProcessInfo.processInfo.environment)
    CrashReporter.setEnabled(true)
    #expect(!CrashReporter.canSendProblemReports)
    CrashReporter.send(
      ProblemReport(description: "Search froze", email: "", details: ProblemReportFixtures.details))
    #expect(!SentrySDK.isEnabled)
    #expect(defaults.string(forKey: CrashReportingPolicy.installIDKey) == nil)
  }
}
