import SwiftUI

struct WatchSessionView: View {
  private enum CaptionState {
    case loading
    case loaded(YouTubeVideoCaptions)
    case failed(YouTubeCaptionError?)
  }

  @Environment(ReadingAidPreferences.self) private var readingAidPreferences
  @Environment(WordKnowledge.self) private var wordKnowledge
  @State private var player = YouTubePlayerController()
  @State private var captionWords: [LanguageReferenceID]?
  @State private var captionState = CaptionState.loading
  @State private var isTranslatingMissingLines = false
  @State private var missingTranslationTask: Task<Void, Never>?
  @State private var scrubPosition: TimeInterval?
  @Binding private var presentedWord: RecognizedWordSheetRequest?

  private let videoID: YouTubeVideoID
  private let captionClient: YouTubeCaptionClient
  private let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  private let history: WatchHistory

  init(
    videoID: YouTubeVideoID,
    history: WatchHistory,
    captionClient: YouTubeCaptionClient,
    japaneseTextAnalysisClient: JapaneseTextAnalysisClient,
    presentedWord: Binding<RecognizedWordSheetRequest?>
  ) {
    self.videoID = videoID
    self.history = history
    self.captionClient = captionClient
    self.japaneseTextAnalysisClient = japaneseTextAnalysisClient
    _presentedWord = presentedWord
  }

  var body: some View {
    VStack(spacing: 0) {
      YouTubePlayerView(videoID: videoID, controller: player)
        .aspectRatio(16 / 9, contentMode: .fit)
        .overlay {
          Color.clear
            .contentShape(.rect)
            .onTapGesture { player.togglePlayback() }
            .accessibilityHidden(true)
        }
        .overlay { playerFailure }
      playbackControls
      Divider()
      captions
    }
    .navigationTitle("Player")
    .inlineNavigationTitle()
    .toolbar {
      ToolbarItem(placement: .barTrailing) { PlayerMoreMenu(videoID: videoID) }
    }
    .task(id: videoID) {
      history.record(videoID)
      await loadCaptions()
    }
    .task(id: captionTextIdentity) { await analyzeCaptionWords() }
    .onChange(of: comprehension?.fraction) { _, fraction in
      if let fraction { history.record(videoID) { $0.comprehension = fraction } }
    }
    .onChange(of: readingAidPreferences.showsTranslations) { requestMissingTranslations() }
    .onChange(of: player.duration) { _, duration in
      if duration > 0 { history.record(videoID) { $0.duration = duration } }
    }
    .onDisappear {
      let position = player.currentTime
      if position > 0 { history.record(videoID) { $0.position = position } }
    }
    .onChange(of: readingAidPreferences.translationSource) {
      Task { await loadCaptions() }
    }
  }

  private var comprehensionSummary: some View {
    HStack(spacing: 8) {
      if let comprehension, let fraction = comprehension.fraction,
        let percent = comprehension.percentText
      {
        Text(percent)
          .font(.footnote.weight(.bold).monospacedDigit())
          .foregroundStyle(ComprehensionBadge.color(for: fraction))
        Text("\(comprehension.knownCount) of \(comprehension.totalCount) words known")
      } else {
        Text("Counting known words…")
      }
    }
    .font(.footnote.monospacedDigit())
    .foregroundStyle(.secondary)
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 20)
    .padding(.vertical, 10)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("watch.comprehension")
  }

  private var comprehension: Comprehension? {
    captionWords.map { Comprehension(words: $0, isKnown: wordKnowledge.isKnown) }
  }

  private var captionTextIdentity: [String] { loadedCues.map(\.text) }

  private func analyzeCaptionWords() async {
    let lines = captionTextIdentity
    guard !lines.isEmpty,
      let words = await Comprehension.countedWords(in: lines, analysis: japaneseTextAnalysisClient)
    else { return }
    captionWords = words
  }

  @ViewBuilder
  private var playerFailure: some View {
    if case .failed(let code) = player.state {
      ContentUnavailableView(
        "Video Unavailable",
        systemImage: "play.slash",
        description: Text(
          code == 101 || code == 150
            ? "The video's owner doesn't allow it to play in other apps."
            : "YouTube couldn't play this video.")
      )
      .background(.black)
      .environment(\.colorScheme, .dark)
    }
  }

  @ViewBuilder
  private var captions: some View {
    switch captionState {
    case .loading:
      ProgressView("Loading captions…")
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityIdentifier("watch.captions-loading")
    case .failed(let error):
      ContentUnavailableView {
        Label("No Japanese Captions", systemImage: "captions.bubble")
      } description: {
        Text(
          error == .noJapaneseCaptions
            ? "This video has no Japanese captions. Try another video."
            : "Zenbu couldn't load this video's captions.")
      } actions: {
        if error != .noJapaneseCaptions {
          Button("Try Again") { Task { await loadCaptions() } }
        }
      }
      .frame(maxHeight: .infinity)
      .accessibilityIdentifier("watch.captions-unavailable")
    case .loaded(let captions):
      captionList(captions)
    }
  }

  private func captionList(_ captions: YouTubeVideoCaptions) -> some View {
    VStack(spacing: 0) {
      comprehensionSummary
      Divider()
      LiveCaptionList(cues: captions.cues, player: player) { cue in cueRow(cue) }
    }
  }

  private func cueRow(_ cue: SubtitleCue) -> some View {
    CaptionCard(
      text: cue.text,
      translation: cue.translation,
      label: timeRange(cue),
      japaneseTextAnalysisClient: japaneseTextAnalysisClient,
      identifierPrefix: "watch.cue.\(cue.id)",
      openCandidates: { surface, candidates in open(surface, candidates: candidates, from: cue) },
      openWord: { entry in open(entry, from: cue) }
    )
    .contentShape(.rect)
    .onTapGesture { play(cue) }
    .accessibilityElement(children: .contain)
    .accessibilityAction(named: "Play from Here") { play(cue) }
    .accessibilityIdentifier("watch.cue.\(cue.id)")
  }

  private var playbackControls: some View {
    VStack(spacing: 0) {
      PlaybackPositionScrubber(
        player: player,
        scrubPosition: $scrubPosition,
        commit: { position in
          if player.loop != nil,
            let cue = loadedCues.last(where: { $0.start <= position }) ?? loadedCues.first
          {
            player.setLoop(cue.start...cue.end)
          }
          player.seek(to: position, play: player.isPlaying)
          scrubPosition = nil
        }
      )
      HStack(spacing: 0) {
        PlaybackTimeText(player: player, scrubPosition: scrubPosition)
        .font(.caption2.monospacedDigit())
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityHidden(true)
        HStack(spacing: 28) {
          Button("Previous Line", systemImage: "backward.end.fill") { step(by: -1) }
            .font(.body)
            .accessibilityIdentifier("watch.previous")
          Button {
            player.togglePlayback()
          } label: {
            Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
              .font(.callout.weight(.semibold))
              .foregroundStyle(SystemColor.background)
              .contentTransition(.symbolEffect(.replace))
              .frame(width: 36, height: 36)
              .background(.primary, in: .circle)
          }
          .accessibilityLabel(player.isPlaying ? "Pause" : "Play")
          .accessibilityIdentifier("watch.play-pause")
          Button("Next Line", systemImage: "forward.end.fill") { step(by: 1) }
            .font(.body)
            .accessibilityIdentifier("watch.next")
        }
        HStack(spacing: 4) {
          repeatButton
          PlaybackSpeedMenu(player: player)
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
      }
      .labelStyle(.iconOnly)
      .tint(.primary)
    }
    .buttonStyle(.borderless)
    .padding(.horizontal, 16)
    .padding(.bottom, 2)
    .background(SystemColor.secondaryBackground)
    .disabled(player.state != .ready)
  }

  private var repeatButton: some View {
    let isOn = player.loop != nil
    return Button(isOn ? "Stop Repeating Line" : "Repeat Line", systemImage: "repeat.1") {
      if isOn {
        player.setLoop(nil)
      } else if let cue = activeCue(in: loadedCues) {
        player.setLoop(cue.start...cue.end)
        if !player.isPlaying { player.seek(to: cue.start, play: false) }
      }
    }
    .font(.footnote.weight(.semibold))
    .foregroundStyle(isOn ? Color.accentColor : .primary)
    .frame(minWidth: 36, minHeight: 44)
    .accessibilityAddTraits(isOn ? .isSelected : [])
    .accessibilityIdentifier("watch.repeat")
  }

  private var loadedCues: [SubtitleCue] {
    if case .loaded(let captions) = captionState { return captions.cues }
    return []
  }

  private func activeCue(in cues: [SubtitleCue]) -> SubtitleCue? {
    cues.last { $0.start <= player.currentTime } ?? cues.first
  }

  private func step(by offset: Int) {
    let cues = loadedCues
    guard !cues.isEmpty else { return }
    let index = cues.last { $0.start <= player.currentTime }?.id ?? -1
    let target = cues[min(max(index + offset, 0), cues.count - 1)]
    if player.loop != nil {
      play(target)
    } else if player.isPlaying, !player.isPlayingOneStretch {
      player.seek(to: target.start)
    } else {
      player.play(from: target.start, until: target.end)
    }
  }

  private func play(_ cue: SubtitleCue) {
    if player.loop != nil { player.setLoop(cue.start...cue.end) }
    player.seek(to: cue.start)
  }

  private func open(_ entry: DictionaryEntry, from cue: SubtitleCue) {
    player.pause()
    presentedWord = RecognizedWordSheetRequest(
      id: "watch.\(videoID.rawValue).\(cue.id).\(entry.id.rawValue)",
      surface: entry.headword,
      entry: entry,
      candidateEntries: [],
      encounterMedia: nil
    )
  }

  private func open(_ surface: String, candidates: [DictionaryEntry], from cue: SubtitleCue) {
    player.pause()
    presentedWord = RecognizedWordSheetRequest(
      id: "watch.\(videoID.rawValue).\(cue.id).\(surface)",
      surface: surface,
      entry: nil,
      candidateEntries: candidates,
      encounterMedia: nil
    )
  }

  private func loadCaptions() async {
    captionState = .loading
    missingTranslationTask?.cancel()
    isTranslatingMissingLines = false
    do {
      var captions = try await captionClient.captions(videoID)
      if readingAidPreferences.translationSource == .apple {
        captions = captions.withoutTranslations
      }
      captionState = .loaded(captions)
      history.record(videoID) { video in
        video.title = captions.title ?? video.title
        video.author = captions.author ?? video.author
      }
      requestMissingTranslations()
    } catch {
      captionState = .failed(error as? YouTubeCaptionError)
    }
  }

  private func requestMissingTranslations() {
    let lines = loadedCues.filter { $0.translation == nil }
    guard readingAidPreferences.showsTranslations, !isTranslatingMissingLines, !lines.isEmpty
    else { return }
    isTranslatingMissingLines = true
    missingTranslationTask = Task {
      let client = NaturalTranslationClient.live
      guard (try? await client.availability()) == .installed else { return }
      for line in lines {
        guard let translation = try? await client.translateInstalled(line.text),
          !Task.isCancelled
        else { return }
        setTranslation(translation, for: line.id, text: line.text)
      }
    }
  }

  private func setTranslation(_ translation: String, for cueID: Int, text: String) {
    guard case .loaded(let captions) = captionState, captions.cues.indices.contains(cueID),
      captions.cues[cueID].text == text
    else { return }
    var cues = captions.cues
    cues[cueID].translation = translation
    captionState = .loaded(
      YouTubeVideoCaptions(
        title: captions.title, cues: cues, isAutomatic: captions.isAutomatic,
        author: captions.author))
  }

  private func timeRange(_ cue: SubtitleCue) -> String {
    "\(Self.timestamp(cue.start)) – \(Self.timestamp(cue.end))"
  }

  static func timestamp(_ seconds: TimeInterval) -> String {
    let total = Int(seconds.rounded(.down))
    let hours = total / 3600
    let minutes = total / 60 % 60
    let secs = total % 60
    return hours > 0
      ? String(format: "%d:%02d:%02d", hours, minutes, secs)
      : String(format: "%d:%02d", minutes, secs)
  }
}
