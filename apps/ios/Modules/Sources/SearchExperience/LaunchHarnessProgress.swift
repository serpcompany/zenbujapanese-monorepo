import Foundation

#if DEBUG
  extension LaunchHarness {
    private struct SeededProgress: Encodable {
      let version = 1
      let days: [String: ProgressLogDay]
    }

    private struct SeededKnowledge: Encodable {
      let version = 2
      let records: [WordKnowledgeRecord]
    }

    private struct ProgressSeed: Decodable {
      struct Word: Decodable {
        let id: String
        let headword: String
        let reading: String
      }

      struct Day: Decodable {
        let learning: Int
        let known: Int
      }

      let goal: Int
      let knownBefore: Int
      let days: [Day]
      let words: [Word]
    }

    static func seedProgress(metDays: Int) {
      guard metDays > 0 else { return }
      let calendar = ProgressWeek.gregorian()
      var days: [String: ProgressLogDay] = [:]
      for back in 1...metDays {
        guard let day = calendar.date(byAdding: .day, value: -back, to: .now) else { continue }
        let change = ProgressLogChange(
          id: "042e07f7052f611fed33ddddf37f55fd", before: "unknown", after: "learning", at: day)
        days[ProgressLog.day(of: day, in: calendar)] = ProgressLogDay(
          changes: [change], goal: 1, totals: ProgressTotals(known: 0, learning: 1))
      }
      write(SeededProgress(days: days), to: ProgressLog.defaultFileURL)
    }

    static func seedProgress(from fixture: URL) {
      guard let data = try? Data(contentsOf: fixture),
        let seed = try? JSONDecoder().decode(ProgressSeed.self, from: data)
      else { return }
      DailyGoal.write(seed.goal, to: .standard)
      let calendar = ProgressWeek.gregorian()
      let today = calendar.startOfDay(for: .now)
      let began = calendar.date(byAdding: .day, value: -seed.days.count, to: today) ?? today
      var known = seed.words.prefix(seed.knownBefore).map { record($0, as: .known, at: began) }
      var unused = seed.words.dropFirst(seed.knownBefore)
      var learning: [WordKnowledgeRecord] = []
      var days: [String: ProgressLogDay] = [:]
      for (index, planned) in seed.days.enumerated() {
        let back = seed.days.count - 1 - index
        guard let day = calendar.date(byAdding: .day, value: -back, to: today) else { continue }
        let at = back == 0 ? Date.now : day.addingTimeInterval(12 * 60 * 60)
        let added = unused.prefix(planned.learning).map { record($0, as: .learning, at: at) }
        unused = unused.dropFirst(planned.learning)
        learning += added
        let marked = learning.prefix(planned.known).map { marking($0, at: at) }
        learning.removeFirst(marked.count)
        known += marked
        let changes =
          added.map { change(of: $0, from: .unknown) } + marked.map { change(of: $0, from: .learning) }
        days[ProgressLog.day(of: day, in: calendar)] = ProgressLogDay(
          changes: changes, goal: seed.goal,
          totals: ProgressTotals(known: known.count, learning: learning.count))
      }
      write(SeededProgress(days: days), to: ProgressLog.defaultFileURL)
      write(SeededKnowledge(records: known + learning), to: WordKnowledge.defaultFileURL)
    }

    private static func record(
      _ word: ProgressSeed.Word, as status: WordKnowledgeStatus, at time: Date
    ) -> WordKnowledgeRecord {
      WordKnowledgeRecord(
        entryID: word.id, headword: word.headword, reading: word.reading, status: status,
        updatedAt: time)
    }

    private static func marking(_ record: WordKnowledgeRecord, at time: Date) -> WordKnowledgeRecord {
      var marked = record
      marked.status = .known
      marked.updatedAt = time
      return marked
    }

    private static func change(
      of record: WordKnowledgeRecord, from before: WordKnowledgeStatus
    ) -> ProgressLogChange {
      ProgressLogChange(
        id: record.entryID, before: before.stored, after: record.status.stored, at: record.updatedAt)
    }

    private static func write(_ value: some Encodable, to file: URL) {
      guard let data = try? JSONEncoder.localStore.encode(value) else { return }
      try? FileManager.default.createDirectory(
        at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
      try? data.write(to: file, options: .atomic)
    }
  }
#endif
