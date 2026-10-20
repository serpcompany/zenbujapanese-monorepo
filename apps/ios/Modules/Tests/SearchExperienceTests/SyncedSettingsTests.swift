import Foundation
import Testing
import TranslatorCore

@testable import SearchExperience

@MainActor
@Suite("Synced settings")
struct SyncedSettingsTests {
  private let suite = "synced-settings-\(UUID().uuidString)"

  private func noticed() async {
    await withCheckedContinuation { done in OperationQueue.main.addOperation { done.resume() } }
  }

  @Test("a Reading Aids value from the account shows in Reading Aids without being sent back, and the learner's change there is told")
  func readingAids() async throws {
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let preferences = ReadingAidPreferences(defaults: defaults)
    let settings = SyncedSettings(defaults: defaults)
    var told: [KeptLocalChange] = []
    settings.changeObserver = { told.append($0) }

    settings.applySynced("readingAids.romaji", .bool(true))
    await noticed()
    #expect(preferences.showsRomaji)
    #expect(told.isEmpty)

    preferences.showsRomaji = false
    settings.noticeChanges()
    #expect(told == [KeptChanges.settingSet("readingAids.romaji", .bool(false))])
  }

  @Test("Image Search's view follows a view from the account, where the view reads its choice, and the learner's change is told")
  func imageSearchView() async throws {
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let settings = SyncedSettings(defaults: defaults)
    var told: [KeptLocalChange] = []
    settings.changeObserver = { told.append($0) }

    settings.applySynced("imageSearch.textView", .string(ImageTextViewMode.text.rawValue))
    #expect(defaults.string(forKey: ImageTextViewMode.storageKey) == ImageTextViewMode.text.rawValue)
    #expect(told.isEmpty)

    defaults.set(ImageTextViewMode.photo.rawValue, forKey: ImageTextViewMode.storageKey)
    settings.noticeChanges()
    #expect(told == [KeptChanges.settingSet("imageSearch.textView", .string(ImageTextViewMode.photo.rawValue))])
  }

  @Test("Translate's speech speed follows a speed from the account, and its layout is no setting")
  func speechSpeed() async throws {
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let folder = FileManager.default.temporaryDirectory.appending(path: suite)
    defer { try? FileManager.default.removeItem(at: folder) }
    let experience = TranslateExperience(
      services: .scripted(.station), history: ConversationHistory(directory: folder),
      defaults: defaults)
    let settings = SyncedSettings(defaults: defaults)

    settings.applySynced("translate.speechSpeed", .decimal(1.5))
    await noticed()
    #expect(experience.speechSpeed == 1.5)
    #expect(!SyncedSetting.all.map(\.name).contains { $0.contains("layout") })
  }
}
