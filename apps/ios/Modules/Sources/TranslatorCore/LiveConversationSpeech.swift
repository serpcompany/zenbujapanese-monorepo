import Foundation

extension LiveConversation {
  func receive(_ event: TranscriptionEvent) {
    guard status == .live else { return }
    let now = now()
    lastSpeechAt = now
    silencePromptDeadline = nil
    switch event {
    case .volatile(let language, let text):
      receiveVolatile(text.trimmingCharacters(in: .whitespacesAndNewlines), in: language, at: now)
    case .final(let language, let text):
      receiveFinal(text.trimmingCharacters(in: .whitespacesAndNewlines), in: language, at: now)
    }
  }

  private func receiveVolatile(_ text: String, in language: SpokenLanguage, at now: Date) {
    guard !text.isEmpty else {
      liveSentence = nil
      return
    }
    if liveSentence?.text != text { lastVolatileChangeAt = now }
    let provisional =
      liveSentence?.language == language ? liveSentence?.provisionalTranslation : nil
    liveSentence = LiveSentence(
      language: language, text: text, provisionalTranslation: provisional)
    requestProvisionalTranslation()
  }

  private func receiveFinal(_ text: String, in language: SpokenLanguage, at now: Date) {
    finishUtteranceRequested = false
    liveSentence = nil
    cancelProvisionalTranslation()
    guard !text.isEmpty else { return }
    if let openTurn, openTurn.language != language { closeOpenTurn() }
    if openTurnID == nil {
      let turn = ConversationTurn(language: language, startedAt: now)
      conversation.turns.append(turn)
      openTurnID = turn.id
      openTurnStartedAt = now
    }
    let sentence = TranslatedSentence(text: text)
    conversation.turns[conversation.turns.count - 1].sentences.append(sentence)
    translate(sentence, from: language)
    if mode.playback == .asTranslated { enqueuePlayback([sentence.id]) }
  }

  func closeOpenTurn() {
    guard let turn = openTurn else { return }
    openTurnID = nil
    openTurnStartedAt = nil
    if mode.playback == .afterEachTurn { enqueuePlayback(turn.sentences.map(\.id)) }
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

  private func enqueuePlayback(_ ids: [UUID]) {
    playbackQueue.append(contentsOf: ids)
    guard playbackTask == nil, !playbackQueue.isEmpty else { return }
    playbackTask = Task { await drainPlayback() }
  }

  private func playbackReachesMicrophone() async -> Bool {
    switch mode.playback {
    case .afterEachTurn: true
    case .asTranslated: await clients.playback.reachesMicrophone()
    case .never: false
    }
  }

  private func drainPlayback() async {
    while status == .live, !Task.isCancelled, let id = playbackQueue.first {
      if let translating = translationTasks[id] { await translating.value }
      guard status == .live, !Task.isCancelled else { return }
      guard playbackQueue.first == id else { continue }
      playbackQueue.removeFirst()
      guard let location = location(of: id),
        let translation = conversation.turns[location.turn].sentences[location.sentence]
          .translation
      else { continue }
      let target = conversation.turns[location.turn].language.counterpart
      if !micClosedForPlayback, await playbackReachesMicrophone() {
        micClosedForPlayback = true
        await clients.transcription.setHearing(false)
      }
      guard status == .live, !Task.isCancelled else { return }
      guard mode.playback != .never else { break }
      speakingSentenceID = id
      speakingLanguage = target
      await clients.playback.speak(translation, target)
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
