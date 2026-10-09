import Foundation

extension LiveConversation {
  func receive(_ event: TranscriptionEvent) {
    guard status == .live else { return }
    let now = now()
    if isEcho(event, at: now) { return }
    lastSpeechAt = now
    silencePromptDeadline = nil
    switch event {
    case .volatile(let language, let text):
      receiveVolatile(text.trimmingCharacters(in: .whitespacesAndNewlines), in: language, at: now)
    case .final(let language, let text):
      receiveFinal(text.trimmingCharacters(in: .whitespacesAndNewlines), in: language, at: now)
    }
  }

  private func isEcho(_ event: TranscriptionEvent, at now: Date) -> Bool {
    let (text, isFinal) =
      switch event {
      case .volatile(_, let text): (text, false)
      case .final(_, let text): (text, true)
      }
    guard echoGuard.isEcho(text, at: now) else { return false }
    if isFinal {
      liveSentence = nil
      cancelProvisionalTranslation()
      enqueuePlayback([])
    }
    return true
  }

  private func receiveVolatile(_ text: String, in language: SpokenLanguage, at now: Date) {
    guard !text.isEmpty else {
      liveSentence = nil
      enqueuePlayback([])
      return
    }
    lastVolatileChangeAt = now
    let kept = liveSentence?.language == language ? liveSentence : nil
    liveSentence = LiveSentence(
      language: language, text: text, provisionalTranslation: kept?.provisionalTranslation,
      provisionalSource: kept?.provisionalSource)
    requestProvisionalTranslation()
  }

  private func receiveFinal(_ text: String, in language: SpokenLanguage, at now: Date) {
    let provisional = liveSentence.flatMap { live in
      live.language == language && Self.covers(text, live.provisionalSource ?? "")
        ? live.provisionalTranslation : nil
    }
    liveSentence = nil
    cancelProvisionalTranslation()
    guard !text.isEmpty else {
      enqueuePlayback([])
      return
    }
    if let openTurn, openTurn.language != language { closeOpenTurn() }
    if openTurnID == nil {
      let turn = ConversationTurn(language: language, startedAt: now)
      conversation.turns.append(turn)
      openTurnID = turn.id
      openTurnStartedAt = now
    }
    let sentence = TranslatedSentence(text: text, translation: provisional)
    conversation.turns[conversation.turns.count - 1].sentences.append(sentence)
    translate(sentence, from: language)
    enqueuePlayback(playback == .asTranslated ? [sentence.id] : [])
  }

  static let coveredShare = 0.95

  static func covers(_ final: String, _ translated: String) -> Bool {
    Double(final.count) >= Double(translated.count) * coveredShare
  }

  func closeOpenTurn() {
    guard let turn = openTurn else { return }
    openTurnID = nil
    openTurnStartedAt = nil
    if playback == .afterEachTurn { enqueuePlayback(turn.sentences.map(\.id)) }
  }

  private func translate(_ sentence: TranslatedSentence, from language: SpokenLanguage) {
    let context = translationContext()
    translatingSentenceIDs.insert(sentence.id)
    translationTasks[sentence.id] = Task { [clients] in
      let translation = try? await clients.translation.translate(sentence.text, language, context)
      finishTranslation(of: sentence.id, with: translation)
    }
  }

  private func finishTranslation(of id: UUID, with translation: String?) {
    translationTasks[id] = nil
    translatingSentenceIDs.remove(id)
    guard !isDiscarded, let location = location(of: id) else { return }
    let trimmed = translation?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if trimmed.isEmpty {
      untranslatedSentenceIDs.insert(id)
      conversation.turns[location.turn].sentences[location.sentence].translation = nil
    } else {
      conversation.turns[location.turn].sentences[location.sentence].translation = trimmed
    }
    persist()
  }

  private func translationContext() -> [TranslationContextLine] {
    let lines = conversation.turns.flatMap { turn in
      turn.sentences.compactMap { sentence in
        sentence.translation.map {
          TranslationContextLine(language: turn.language, text: sentence.text, translation: $0)
        }
      }
    }
    return Array(lines.suffix(timing.contextSentences))
  }

  private func location(of id: UUID) -> (turn: Int, sentence: Int)? {
    for turnIndex in conversation.turns.indices.reversed() {
      if let sentenceIndex = conversation.turns[turnIndex].sentences.firstIndex(where: {
        $0.id == id
      }) {
        return (turnIndex, sentenceIndex)
      }
    }
    return nil
  }

  private func requestProvisionalTranslation() {
    guard !provisionalInFlight, liveSentence != nil else { return }
    provisionalInFlight = true
    provisionalTask = Task { [clients, timing] in
      try? await Task.sleep(for: timing.provisionalDelay)
      guard !Task.isCancelled else { return }
      guard let requested = liveSentence else {
        provisionalInFlight = false
        return
      }
      let translation = try? await clients.translation.translate(
        requested.text, requested.language, [])
      guard !Task.isCancelled else { return }
      provisionalInFlight = false
      if let translation, liveSentence?.language == requested.language {
        liveSentence?.provisionalTranslation = translation
        liveSentence?.provisionalSource = requested.text
      }
      if let current = liveSentence, current.text != requested.text {
        requestProvisionalTranslation()
      }
    }
  }

  func cancelProvisionalTranslation() {
    provisionalTask?.cancel()
    provisionalTask = nil
    provisionalInFlight = false
  }

  private var playbackMustWait: Bool {
    playback == .afterEachTurn && liveSentence != nil
  }

  func enqueuePlayback(_ ids: [UUID]) {
    playbackQueue.append(contentsOf: ids)
    guard playbackTask == nil, !playbackQueue.isEmpty, !playbackMustWait else { return }
    playbackTask = Task { await drainPlayback() }
  }

  private func playbackReachesMicrophone() async -> Bool {
    playback == .never ? false : await clients.playback.reachesMicrophone()
  }

  private func drainPlayback() async {
    while status == .live, !Task.isCancelled, !playbackMustWait, let id = playbackQueue.first {
      if let translating = translationTasks[id] { await translating.value }
      guard status == .live, !Task.isCancelled else { return }
      guard playbackQueue.first == id else { continue }
      guard let location = location(of: id),
        let translation = conversation.turns[location.turn].sentences[location.sentence]
          .translation
      else {
        playbackQueue.removeFirst()
        continue
      }
      let target = conversation.turns[location.turn].language.counterpart
      if !micClosedForPlayback, await playbackReachesMicrophone() {
        micClosedForPlayback = true
        await clients.transcription.setHearing(false)
      }
      guard status == .live, !Task.isCancelled else { return }
      guard playbackQueue.first == id else { continue }
      playbackQueue.removeFirst()
      speakingSentenceID = id
      speakingLanguage = target
      echoGuard.startSpeaking(translation)
      await clients.playback.speak(translation, target)
      echoGuard.finishSpeaking(at: now())
      speakingSentenceID = nil
      speakingLanguage = nil
    }
    guard !Task.isCancelled else { return }
    if micClosedForPlayback {
      try? await Task.sleep(for: timing.playbackTail)
      guard status == .live, !Task.isCancelled else { return }
      micClosedForPlayback = false
      await clients.transcription.setHearing(true)
    }
    lastSpeechAt = now()
    playbackTask = nil
    enqueuePlayback([])
  }
}
