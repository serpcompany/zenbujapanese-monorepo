# Zenbu Japanese 1.0 privacy audit results

This is the frozen privacy and security record for Zenbu Japanese 1.0 build 14.
The reusable audit modes and evidence checklist are maintained in the
[release privacy verification procedure](../../../../apps/ios/Verification/release-privacy-procedure.md).

## Candidate identity

- Marketing version: 1.0
- App Store build: 14
- Bundle identifier: `com.zenbujapanese.dictionary`
- Binary source commit: `5e6e456da438846527dcab9e639c3bdfe495f28a`
- Signed-candidate application SHA-256:
  `455eed3a89345a37c6934eed0799cc103b5111ff163bee4bd11dbaa9cb4153cb`
- Uploaded IPA SHA-256:
  `62314c9f5adad50a9a15aef6a694db2b06dc94ad6330715329a4aa0fc6552aed`

## Product data inventory

| Flow | Input or stored content | Processing and retention | User control | Network expectation |
| --- | --- | --- | --- | --- |
| Search | Japanese or English query | Up to 50 recent queries in app-only `UserDefaults` | Delete one query, clear all recent queries, or uninstall | None |
| Word notes | Free-form note attached to a Language Reference Data entry | App-only `UserDefaults` until deleted | Delete notes individually or uninstall | None |
| Camera | One image captured after explicit Camera permission | Copied into the current Image Text Flow. Opening a recognized word retains the image as Encounter Media associated with that word; otherwise it is removed when the flow closes | Deny permission, close without opening a word, choose Remove from Word, delete the media from Media Library, or uninstall | None |
| Photo Library | One image selected through Apple's limited system picker | Copied into the current Image Text Flow. Opening a recognized word retains the image as Encounter Media associated with that word; otherwise it is removed when the flow closes | Cancel selection, close without opening a word, choose Remove from Word, delete the media from Media Library, or uninstall | None |
| Files | User-selected image copies | Size and image metadata are read to reject unsafe inputs. Opening a recognized word retains the image as Encounter Media associated with that word; otherwise accepted data remains only for the current flow | Cancel selection, close without opening a word, choose Remove from Word, delete the media from Media Library, or uninstall | None |
| Encounter Media | Source images for words opened from Image Text | Content-addressed app-only Application Support storage; identical bytes are stored once, can be associated with several words, and participate in normal system-managed device backup | Remove one association from Word Detail, delete the image and all associations from Media Library, or uninstall | None |
| OCR | Image pixels | Apple's Vision framework performs Japanese text recognition | Close the flow | None |
| Translation | Recognized or entered Japanese text | Apple's Translation framework uses installed Japanese-to-English language assets | Close the flow | No Zenbu-operated service |
| Speech | User-selected Japanese text | Apple's Speech Synthesis produces playback | Stop playback or leave the screen | None |
| Clipboard | Recognized text | Written to the system clipboard only after the user taps Copy Text | Replace or clear the clipboard using the system | None |
| External links | User-initiated support, privacy, source, and license links | Opened by the operating system | Do not tap or close the browser | Normal browser behavior; no hidden app transmission |

Version 1.0 has no account, cloud sync, analytics, advertising, third-party
crash-reporting SDK, or app-operated network client. On-device content is not
data collected by Zenbu for App Store privacy-label purposes.

## Required-reason APIs

- `UserDefaults` uses `CA92.1` for app-only recent searches and word notes.
- User-selected Files metadata uses `3B52.1` to read the selected image size
  before loading it.
- The manifest declares no tracking domains and no collected data types.

## Recorded outcome

- The source privacy and bundled-data audit passed.
- The frozen signed Release archive passed privacy-manifest, signature,
  entitlement, dependency, packaged-URL, dictionary, and example-sentence
  inspection.
- The support and privacy URLs returned HTTPS 200 before submission.
- App Store Connect App Privacy was read back as published with
  `Data Not Collected` before submission.
- Export compliance was determined after the candidate dependencies and runtime
  network behavior were frozen.

## Preserved physical-device boundary

The Gate 3 contract designated the authorized iPhone 14 Pro Max, UDID
`00008120-00040469019B401E`, for Camera first-use, denied, restricted, and
unavailable checks. Issue #143 records a partial USB checkpoint where app
installation and launch passed but Camera interaction was skipped. That partial
checkpoint is retained as an evidence boundary, not reported here as a build 14
Camera pass.

Operational audit checkpoints and approval history remain tracked in
[issue #143](https://github.com/serpcompany/zenbujapanese-monorepo/issues/143)
and its linked work. This file is the repository-versioned result summary, not
a replacement for those operational artifacts. It does not promote the issue's
earlier unsigned archives or partial physical-device Camera checks to build 14
evidence.
