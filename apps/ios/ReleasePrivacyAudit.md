# Release privacy and security audit

This is the durable audit contract for the exact Zenbu Japanese 1.0 release candidate. Source inspection and runtime observation are separate evidence. Neither substitutes for inspection of the frozen archive.

## Product data inventory

| Flow | Input or stored content | Processing and retention | User control | Network expectation |
| --- | --- | --- | --- | --- |
| Search | Japanese or English query | Up to 50 recent queries in app-only `UserDefaults` | Delete one query, clear all recent queries, or uninstall | None |
| Word notes | Free-form note attached to a Language Reference Data entry | App-only `UserDefaults` until deleted | Delete notes individually or uninstall | None |
| Camera | One image captured after explicit Camera permission | Copied into the current in-memory Image Text Flow; removed when the flow closes | Deny permission, close the flow, or uninstall | None |
| Photo Library | One image selected through Apple's limited system picker | Copied into the current in-memory Image Text Flow; removed when the flow closes | Cancel selection or close the flow | None |
| Files | User-selected image copies | Size and image metadata are read to reject unsafe inputs; accepted data remains in the current in-memory Image Text Flow | Cancel selection or close the flow | None |
| OCR | Image pixels | Apple's Vision framework performs Japanese text recognition | Close the flow | None |
| Translation | Recognized or entered Japanese text | Apple's Translation framework uses installed Japanese-to-English language assets | Close the flow | No Zenbu-operated service |
| Speech | User-selected Japanese text | Apple's Speech Synthesis produces playback | Stop playback or leave the screen | None |
| Clipboard | Recognized text | Written to the system clipboard only after the user taps Copy Text | Replace or clear the clipboard using the system | None |
| External links | User-initiated support, privacy, source, and license links | Opened by the operating system | Do not tap or close the browser | Normal browser behavior; no hidden app transmission |

Version 1.0 has no account, cloud sync, analytics, advertising, third-party crash reporting SDK, or app-operated network client. On-device content is not data collected by Zenbu for App Store privacy-label purposes.

## Required-reason APIs

- `UserDefaults` uses `CA92.1` for app-only recent searches and word notes.
- User-selected Files metadata uses `3B52.1` to read the selected image size before loading it.
- The manifest declares no tracking domains and no collected data types.

Run the source audit:

```sh
apps/ios/Tools/audit_release_privacy.sh
```

Run the frozen-archive audit:

```sh
apps/ios/Tools/audit_release_privacy.sh /absolute/path/to/ZenbuJapanese.xcarchive
```

## Final candidate evidence

The Gate 3 owner must attach these results to issue #143 for the exact candidate commit and archive:

- Source audit output and dependency inventory.
- Release runtime network observation, with the test device, OS, duration, flows exercised, and observed destinations reported separately.
- Archive audit output, application hash, privacy manifest, linked libraries, and signed entitlements.
- Physical-iPhone Camera first-use, denied, restricted, and unavailable results. Simulator injection may supplement but cannot replace the physical check.
- HTTPS 200 checks and screenshots for `https://zenbujapanese.com/support` and `https://zenbujapanese.com/privacy`.
- Secret-scan tool/version, commit, findings count, and disposition. Do not publish secret values.
- App Store Connect App Privacy read-back and publication screenshot after the final binary is frozen.
- Export-compliance determination after final dependencies and runtime network behavior are frozen.

Any candidate change after these results invalidates the affected evidence and requires a rerun.
