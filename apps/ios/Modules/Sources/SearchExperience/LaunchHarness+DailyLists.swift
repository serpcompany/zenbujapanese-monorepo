#if DEBUG
  import Foundation

  extension LaunchHarness {
    static let dailyListsKey = "ZENBU_DAILY_LISTS"

    private struct SeededLists: Encodable {
      let version = 2
      let lists: [WordList]
      let memberships: [WordListMembership]
      let deletedDailyLists: [UUID] = []
    }

    private struct SeededKnowledge: Encodable {
      let version = 2
      let records: [WordKnowledgeRecord]
    }

    private static let seededWords = """
      262ea7b4342d41837de1d4302b25b5a2 飲む のむ
      7f490a9c9c0da94f4e9474f4efe74be1 見る みる
      8437a68ce392574a87fc48a74e1d7409 友達 ともだち
      ac0944d2570e80751633fb2802e23c4c 聞く きく
      042e07f7052f611fed33ddddf37f55fd 食べる たべる
      05bdb8e2a85ec93ecc4ce862072329b5 時間 じかん
      11f59f15bcbbd9324880efb97d43df2b 家 うち
      132ec115831c1cda3588d31e99b30ead 読む よむ
      1855b1ddf4a3790af26f8440ff6d4d06 起きる おきる
      29595383f3924b6652e6f4d0163154ad 雨 あめ
      3ee73bc74b631954edbad00428460bd4 寝る ねる
      4f6dd65aeb7d4e8fbba112ceacf6163c 話す はなす
      52d0eab895319d9bd11f8d66f2f0a60b 仕事 しごと
      577a2b8a97531e9f6128c4be0eeb21d6 歩く あるく
      59e7e7802475b49cbe31f60aff9187af 猫 ねこ
      5bf15e43d6c3121869ce7844c3825108 漢字 かんじ
      5ef979a1dd232e17f3406d24829960b9 音楽 おんがく
      6245b12a543fe049cb5c9e623e12fb75 本 ほん
      681bff8274391329f3ce9ca80a4e04b0 犬 いぬ
      6a612ccf4b94b5318d3c9badc0b32f1e 学校 がっこう
      6c3ac8e45d5573259231585d6b69402a 季節 きせつ
      722c94624b09c10ca07a96c1cb03701f 水 みず
      72309de2d19aa24aa677dfba2428ff13 先生 せんせい
      77f7e3b032090284623ed627e35cf16a 車 くるま
      79ec6f1235b48ae97a7aca6f3c345acb 言葉 ことば
      7bd0d56fe94134def5c39c16deeee5e0 天気 てんき
      9061127f381d4c2c1666bd910556c0e0 花 はな
      a6fca4746fb6d90f45efd30334c8536d 書く かく
      a8aca8c27e34151011d8ece20ada3f96 山 やま
      ba9c5335622f7dd0afbea982ec5f3f96 料理 りょうり
      c4e601713d815fa3df0de5e56735122d 電車 でんしゃ
      ca7243c6d7cf5656e002ed16cc100075 海 うみ
      d02c0e432941aa528593ef408591fd5f 買う かう
      d49b2f3c5cbf3002ebf317043cbebdad 駅 えき
      edacc0395a3ac1b6909fb76a3c9d0717 映画 えいが
      edf18362d54832b550e6c8666235b4a0 写真 しゃしん
      """
      .split(separator: "\n").map { $0.split(separator: " ").map(String.init) }

    static func seedDailyLists(days count: Int) {
      guard count > 0 else { return }
      var calendar = Calendar(identifier: .gregorian)
      calendar.timeZone = .autoupdatingCurrent
      var lists = [
        WordList(
          id: WordLists.favoritesID, name: WordLists.defaultListName, position: 0,
          createdAt: .now, updatedAt: .now)
      ]
      var memberships: [WordListMembership] = []
      var records: [WordKnowledgeRecord] = []
      var days: [String: ProgressLogDay] = [:]
      var next = 0
      for back in 1...count {
        guard let date = calendar.date(byAdding: .day, value: -back, to: .now) else { continue }
        let day = ProgressLog.day(of: date, in: calendar)
        guard let listID = AccountRules.shared.dailyListID(day) else { continue }
        lists.append(
          WordList(
            id: listID, name: DailyListDays.name(of: day), position: back - 1, createdAt: date,
            updatedAt: date))
        let words = (0..<(2 + back % 3)).map { seededWords[(next + $0) % seededWords.count] }
        next += words.count
        let known = min(words.count, (back + 1) / 3)
        var changes: [ProgressLogChange] = []
        for (index, word) in words.enumerated() {
          memberships.append(
            WordListMembership(
              listID: listID, entryID: word[0], headword: word[1], reading: word[2],
              addedAt: date))
          records.append(
            WordKnowledgeRecord(
              entryID: word[0], headword: word[1], reading: word[2],
              status: index < known ? .known : .learning, updatedAt: date))
          changes.append(
            ProgressLogChange(id: word[0], before: "unknown", after: "learning", at: date))
        }
        days[day] = ProgressLogDay(
          changes: changes, goal: 3, totals: ProgressTotals(known: 0, learning: words.count))
      }
      write(SeededLists(lists: lists, memberships: memberships), to: WordLists.defaultFileURL)
      write(SeededKnowledge(records: records), to: WordKnowledge.defaultFileURL)
      write(SeededProgress(days: days), to: ProgressLog.defaultFileURL)
    }

    static func write(_ seeded: some Encodable, to file: URL) {
      guard let data = try? JSONEncoder.localStore.encode(seeded) else { return }
      try? FileManager.default.createDirectory(
        at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
      try? data.write(to: file, options: .atomic)
    }
  }
#endif
