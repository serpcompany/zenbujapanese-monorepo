import Foundation
import SwiftUI
import Testing
import TranslatorCore

@testable import SearchExperience

@MainActor
@Suite("Synced settings")
struct SyncedSettingsTests {
  private let folder = FileManager.default.temporaryDirectory
    .appending(path: "synced-settings-\(UUID().uuidString)")

  private func noticed() async {
    await withCheckedContinuation { done in OperationQueue.main.addOperation { done.resume() } }
  }

  private func translate(on defaults: UserDefaults) -> TranslateExperience {
    TranslateExperience(
      services: .scripted(.station), history: ConversationHistory(directory: folder),
      defaults: defaults)
  }

  @Test("a Reading Aids value from the account shows in Reading Aids without being sent back, and the learner's change there is told")
  func readingAids() async throws {
    let defaults = MemoryDefaults()
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
    let defaults = MemoryDefaults()
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
    let defaults = MemoryDefaults()
    defer { try? FileManager.default.removeItem(at: folder) }
    let experience = translate(on: defaults)
    let settings = SyncedSettings(defaults: defaults)

    settings.applySynced("translate.speechSpeed", .decimal(1.5))
    await noticed()
    #expect(experience.speechSpeed == 1.5)
    #expect(!SyncedSetting.all.map(\.name).contains { $0.contains("layout") })
  }

  @Test("a learner's change through Reading Aids, Translate's speed, or a screen's stored choice is told as it's made")
  func everyWriterIsHeard() async throws {
    let defaults = MemoryDefaults()
    defer { try? FileManager.default.removeItem(at: folder) }
    let preferences = ReadingAidPreferences(defaults: defaults)
    let experience = translate(on: defaults)
    let filter = AppStorage(
      wrappedValue: ResultsLearner.noFilter, ResultsLearner.filterKey, store: defaults)
    let settings = SyncedSettings(defaults: defaults)
    var told: [KeptLocalChange] = []
    settings.changeObserver = { told.append($0) }

    preferences.showsRomaji = true
    experience.speechSpeed = 1.5
    filter.wrappedValue = "known"
    await noticed()

    #expect(told.contains(KeptChanges.settingSet("readingAids.romaji", .bool(true))))
    #expect(told.contains(KeptChanges.settingSet("translate.speechSpeed", .decimal(1.5))))
    #expect(told.contains(KeptChanges.settingSet("search.filter", .string("known"))))
  }

  @Test("another defaults store's change costs Synced settings nothing: it reads again only when its own store changes")
  func hearsOnlyItsOwnStore() async throws {
    let defaults = MemoryDefaults()
    let other = MemoryDefaults()
    let reads = CallCount()
    let counted = SyncedSetting(
      name: "counted", standard: .bool(false),
      read: { _ in
        _ = reads.next()
        return nil
      }, write: { _, _ in })
    let settings = SyncedSettings(defaults: defaults, settings: [counted])
    let atStart = reads.current

    other.set(true, forKey: "elsewhere")
    await noticed()
    #expect(reads.current == atStart)

    defaults.set(true, forKey: "here")
    await noticed()
    #expect(reads.current > atStart)
    withExtendedLifetime(settings) {}
  }
}
