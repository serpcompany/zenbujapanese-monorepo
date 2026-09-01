# Word Detail top-bar actions for issue #238

Research for [#238](https://github.com/serpcompany/zenbujapanese-monorepo/issues/238) on the shared native-refactor branch at `69965a90a795f3fdbabfb86efb82e12fb27d3566`. Consulted 2026-09-02. This note changes no production Swift, tests, data, issue state, dependency, or product behavior.

## Verdict

Adopt **one visible Add pull-down menu** in the Word Detail trailing navigation bar. Its menu contains three explicit commands:

1. **Add Note** — `square.and.pencil`
2. **Take Photo** — `camera`
3. **Choose Photo** — `photo.on.rectangle`

The toolbar label is **Add**, visually represented by the standard `plus` symbol and semantically retained as “Add” for VoiceOver. Keep the current system-owned appearance and Option A system tint. Do not show Zenbu coral/red on these ordinary actions.

```text
┌ Back ─────────────── Word ─────────────── Add (+) ┐
│                                                   │
│                         ┌ Add Note              ✎ │
│                         │ Take Photo            ◉ │
│                         └ Choose Photo          ▧ │
```

This is the strongest fit because Apple:

- tells designers to consider **one or two essential actions** in an iPhone screen toolbar, not a fixed universal count; [Apple Develop in Swift: Organize your features](https://developer.apple.com/tutorials/develop-in-swift/organize-your-features)
- says iPhone toolbars should expose only the most important items and move additional actions to More; there is no current HIG numeric maximum; [Apple HIG: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)
- uses an **Add button that asks what to add** as the first example of a valid pull-down and says a minimum of three menu items can make the extra interaction feel worthwhile; [Apple HIG: Pull-down buttons](https://developer.apple.com/design/human-interface-guidelines/pull-down-buttons)
- identifies `plus` as the standard Add symbol and `square.and.pencil` as the standard Compose symbol. [Apple HIG: Icons](https://developer.apple.com/design/human-interface-guidelines/icons)

This recommendation is an application of Apple guidance to Zenbu's three additive Word Detail actions, not a claim that Apple mandates this exact arrangement.

## Current Zenbu evidence

The current Word Detail has an inline navigation title and a trailing `ToolbarItemGroup` with two direct icon-only controls:

- Add Note: `square.and.pencil`, accessibility label “Add note”;
- Photo Library only: `photo.badge.plus`, accessibility label “Add encounter image”.

The actual checked-in screen shows both controls sharing the trailing system group. A third direct icon would make a three-glyph cluster beside the inline word title. [current source](../../apps/ios/Modules/Sources/SearchExperience/WordDetailView.swift), [current screenshot](../../apps/ios/Verification/ISSUE-216-NATIVE-CHROME/after/word-detail.png)

The existing Add Note shortcut is not the only way to add a note: Word Detail also has a visible **Add Note** action in the Notes section. Moving the toolbar shortcut into the clearly labeled Add menu therefore preserves an immediately reachable add affordance without making note creation dependent on an undisclosed ellipsis. This note does not authorize changing note behavior.

ADR 0004 calls the stored domain object **Encounter Media**, but that does not make “Encounter Media” appropriate learner-facing command text. The source choice is clearer as **Take Photo** or **Choose Photo**; the resulting Word Detail content may continue to use its established saved-image wording. [ADR 0004](../adr/0004-word-image-attachment-persistence.md)

## What “typical” means in current Apple guidance

Apple does not prescribe “exactly two” or “never three” trailing iPhone actions. It prescribes priority:

- expose commands people are most likely to want;
- keep iPhone's limited toolbar space to essential actions;
- avoid overcrowding so controls remain distinguishable and operable;
- use More for additional items, recognizing that an ellipsis makes contents harder to predict. [Apple HIG: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars), [Apple HIG: Pull-down buttons](https://developer.apple.com/design/human-interface-guidelines/pull-down-buttons)

Apple's current introductory design tutorial turns that into a useful default: ask whether a screen needs a toolbar with **one or two essential actions**. This is a design heuristic, not an API limit. [Apple Develop in Swift: Organize your features](https://developer.apple.com/tutorials/develop-in-swift/organize-your-features)

Three direct actions can be appropriate when all three are independent, high-priority, frequently used, instantly recognizable, and still comfortably fit. That is not the shape here: Camera and Photo Library are alternative sources for the same “add a photo” outcome, while Add Note is a third additive command. A labeled Add menu communicates the common intent and gives every choice readable text.

## Candidate layouts

| Candidate | Assessment | Reason and caveat |
|---|---|---|
| **A. One Add menu: Add Note / Take Photo / Choose Photo** | **Adopt** | One visible essential toolbar action; three commands directly match Apple's Add-menu example and useful menu-length guidance. It also avoids “Encounter Media” jargon. Caveat: one extra tap is required for every command, so the menu label and items must remain explicit and the existing in-section Add Note affordance must remain. |
| **B. Direct Add Note + Add Photo menu with Take Photo / Choose Photo** | **Adapt only if owner testing shows Add Note must remain direct** | Keeps two top-level actions and groups the two media sources, matching Apple's Notes attachment pattern. However, Apple says a one- or two-item pull-down can feel disproportionate; use this only if direct Add Note priority outweighs that caveat. Use `photo.badge.plus` and the label “Add Photo”, not `ellipsis`. |
| **C. Three direct icons: Note / Camera / Photo Library** | **Reject for Word Detail** | Avoids an extra tap, but exceeds Apple's one-or-two-action planning heuristic, crowds the observed inline-title layout, and asks learners to distinguish two adjacent unlabeled photo-source glyphs. Reconsider only with evidence that all three are frequent primary tasks and narrow/AXXXL testing remains clear. |
| **D. Direct Camera + generic More containing Photo Library and Add Note** | **Reject** | Asymmetric source treatment makes Camera look like the outcome while Photo Library becomes secondary, and the ellipsis does not predict its contents. Adapt only if measured/user-tested behavior proves real-time capture is substantially more important than both existing-photo and note creation. |
| **E. Direct Add Note + direct Camera + More containing Photo Library** | **Reject** | Still presents three controls, hides only one half of the same source choice, and provides neither the density benefit nor semantic coherence of A or B. |

`ControlGroup` is useful for semantically related controls and supplies a label if a toolbar group moves to overflow. A labeled `ToolbarItemGroup` can also collapse according to available space. Neither should be used here as a substitute for deciding the iPhone presentation: Add Note is not a media-source control, and a normal-width state that sometimes displays Camera and Library separately would make the interaction less predictable than an explicit Add menu. [SwiftUI `ControlGroup`](https://developer.apple.com/documentation/swiftui/controlgroup), [labeled `ToolbarItemGroup`](https://developer.apple.com/documentation/swiftui/toolbaritemgroup/init%28placement%3Acontent%3Alabel%3A%29)

## Discoverability and accessibility

### Exact labels and symbols

| Element | Visible presentation | Semantic / VoiceOver label | SF Symbol |
|---|---|---|---|
| Top-bar menu | icon-only in the toolbar | **Add** | `plus` |
| Menu item 1 | **Add Note** plus symbol | **Add Note** | `square.and.pencil` |
| Menu item 2 | **Take Photo** plus symbol | **Take Photo** | `camera` |
| Menu item 3 | **Choose Photo** plus symbol | **Choose Photo** | `photo.on.rectangle` |

The current iOS 26 SDK/repo already uses these symbol families, but the implementation pass must still verify individual symbol availability in the installed SF Symbols catalog for the deployment target. The HIG standard-icon table directly standardizes `plus` and `square.and.pencil`; it does not mandate a particular Camera/Photo Library pair. [Apple HIG: Icons](https://developer.apple.com/design/human-interface-guidelines/icons), [Apple HIG: SF Symbols](https://developer.apple.com/design/human-interface-guidelines/sf-symbols)

Use semantic `Button`/`Label` declarations with both title and system image. SwiftUI can then show an icon in the toolbar, show title plus icon in a menu, and retain the title for accessibility. Avoid an image-only label with a separately drifting accessibility string. [SwiftUI `Button`](https://developer.apple.com/documentation/swiftui/button), [SwiftUI `Menu`](https://developer.apple.com/documentation/swiftui/menu)

Do not use a `Menu` primary action that silently performs one default command and reserves the choices for long press. Apple documents that this changes tap into the primary action and menu presentation into a secondary gesture; that would make the two photo sources harder to discover. A normal tap must open the three-command menu. [Apple: Populating SwiftUI menus with adaptive controls](https://developer.apple.com/documentation/swiftui/populating-swiftui-menus-with-adaptive-controls)

### Compact width and Accessibility XXXL

- Keep the top-level control symbol-only at every text size; do not force three growing text labels into the navigation bar.
- Let the native menu show full text labels and symbols. Do not abbreviate “Photo Library” to an unexplained glyph-only choice.
- Preserve the system toolbar's recommended 44×44-point default control region and adequate separation; do not shrink the hit target to fit more glyphs. [Apple HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- At compact width and Accessibility XXXL, keep the same Add command and item order. The inline word title may truncate before the action disappears; do not conditionally hide a command based only on text size.
- Test the smallest supported iPhone width and Accessibility XXXL in both appearances for clipping, accidental activation, menu-item wrapping, VoiceOver order, and Switch/Voice Control labels. Apple recommends previewing across screen sizes, localizations, orientations, and text sizes. [Apple HIG: Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Apple HIG: VoiceOver](https://developer.apple.com/design/human-interface-guidelines/voiceover), [Apple HIG: Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- While a note is being edited, preserve the current modal toolbar state: show the explicit **Done** action instead of add commands. Apple's toolbar guidance says to provide contextually relevant controls in a modal state and only one primary action. [Apple HIG: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)

Menus trade one tap for clarity and density. Here that trade is acceptable because the three items are explicit variants of Add and the Notes section retains an in-context Add Note action. A generic More menu would take the same extra tap without communicating the task.

## First-party Apple patterns

These are evidence of current Apple-owned conventions, not universal mandates:

- **Notes on iPhone** uses one Attachments button, then lets people choose from the Photo Library or take a new photo/video. [Apple iPhone User Guide: Add photos, video, and more to notes](https://support.apple.com/guide/iphone/add-photos-video-and-more-iph23f4d9aa9/ios)
- **Pages on iPhone** uses one toolbar content/media entry point, followed by explicit **Choose Photo or Video** and **Take Photo or Video** choices; a media placeholder similarly exposes both under one replace-image affordance. [Apple Pages User Guide: Add an image](https://support.apple.com/en-bh/guide/pages-iphone/tanb3bc78786/ios)
- Apple's current SwiftUI design session places a purpose-labeled `Menu` alongside a direct action in a `ToolbarItemGroup`, demonstrating that a menu label should describe its command family rather than defaulting to ellipsis. [WWDC25: Build a SwiftUI app with the new design](https://developer.apple.com/videos/play/wwdc2025/323/)

The Notes and Pages examples group Camera and Photo Library under a broader attachment/media action. Zenbu's single Add menu is an adaptation to its actual three-command set, not a copy of either app.

## SwiftUI and system-picker implications

- `.topBarTrailing` is the trailing navigation-bar edge on iOS. `ToolbarItem`, `ToolbarItemGroup`, and `Menu` are the native primitives for the proposed shape. [SwiftUI `topBarTrailing`](https://developer.apple.com/documentation/swiftui/toolbaritemplacement/topbartrailing), [SwiftUI `ToolbarItemGroup`](https://developer.apple.com/documentation/swiftui/toolbaritemgroup), [SwiftUI `Menu`](https://developer.apple.com/documentation/swiftui/menu)
- `PhotosPicker` is specifically the system Photo Library chooser. It supports image filtering and returns `Transferable` selection placeholders; it is not a camera UI. Keep it for **Choose Photo**. [PhotosUI `PhotosPicker`](https://developer.apple.com/documentation/photosui/photospicker), [Apple sample: Bringing Photos picker to your SwiftUI app](https://developer.apple.com/documentation/photokit/bringing-photos-picker-to-your-swiftui-app)
- Apple's modern Photos picker presents the library in a system view and gives the app access only to the items a person selects. [Apple PhotosUI overview](https://developer.apple.com/documentation/photosui)
- Camera capture is a separate, device-only path. Apple's current AVCam sample requires a physical device and explicitly says Simulator has no camera access; #238 must continue to report physical-device evidence separately. [Apple sample: AVCam — Building a camera app](https://developer.apple.com/documentation/avfoundation/avcam-building-a-camera-app)

The toolbar decision does not choose camera infrastructure. The existing Image Text bridge and normalized-image path remain the implementation audit subjects required by #238.

## Product questions that remain

The toolbar question can be resolved independently. Implementation still requires the owner to answer these exact questions from #238:

1. **After Take Photo succeeds, should Zenbu (A) attach the normalized image directly to this word as Encounter Media, or (B) enter Image Text recognition first and attach only through that flow?** Recommendation from scope coherence: **A**, because this command originates in Word Detail and #238 says not to redesign OCR, but ADR 0004 does not decide it.
2. **Should the system capture flow allow editing/cropping before attachment: Yes or No?** Recommendation: **No** unless an observed learner need justifies it; keep normalization deterministic.
3. **Must Zenbu strip location and other source metadata before persistence: Yes or No?** Recommendation: **Yes**, and verify the normalized JPEG contains only required image properties; #238 already treats this as an explicit privacy decision.

No toolbar evidence establishes those product behaviors, and none should be inferred during implementation.
