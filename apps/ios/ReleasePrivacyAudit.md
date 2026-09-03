# Release privacy and security audit

This is the durable audit contract for the exact Zenbu Japanese 1.0 release candidate. Source inspection and runtime observation are separate evidence. Neither substitutes for inspection of the frozen archive.

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
| Frequency Pack download | A learner-initiated request for one Zenbu-curated public frequency artifact | `URLSession` fetches only the immutable source URL embedded in the app-signed catalog. Zenbu validates exact bytes and SHA-256, imports locally, and stores the validated pack in app-only Application Support. No query, note, image, identifier, or learner content is sent. | Do not tap Download, remove the optional pack, or uninstall | GitHub raw-content host named in the reviewed catalog; no Zenbu-operated service |
| Japanese Text Analysis Pack download | A learner-initiated request for the optional SudachiDict Core wheel | `URLSession` fetches only the immutable official release URL embedded in the app-signed catalog. Zenbu validates the wheel, extracts only the named dictionary entry, validates exact installed bytes, runtime resources, and golden output, then atomically stores the pack in app-only Application Support excluded from backup. No query, recognized text, image, identifier, or learner content is sent. | Do not tap Download, remove the pack, or uninstall | GitHub release host named in the reviewed catalog; no Zenbu-operated service |
| External links | User-initiated support, privacy, source, and license links | Opened by the operating system | Do not tap or close the browser | Normal browser behavior; no hidden app transmission |

Version 1.0 has no account, cloud sync, analytics, advertising, third-party crash reporting SDK, or Zenbu-operated service. Its two app-operated network clients are the learner-initiated, immutable-URL Frequency Pack and Japanese Text Analysis Pack downloaders described above. Neither sends learner content. On-device content is not data collected by Zenbu for App Store privacy-label purposes.

## Required-reason APIs

- `UserDefaults` uses `CA92.1` for app-only recent searches and word notes.
- User-selected Files metadata uses `3B52.1` to read the selected image size before loading it.
- The manifest declares no tracking domains and no collected data types.

Run the source audit:

```sh
apps/ios/Tools/audit_release_privacy.sh source
```

Run an explicitly unsigned Release archive preflight while iterating locally:

```sh
apps/ios/Tools/audit_release_privacy.sh unsigned-preflight /absolute/path/to/ZenbuJapanese.xcarchive
```

This mode proves packaging, dependency, URL, DEBUG-resource, private-evidence, credential-pattern, manifest, and canonical-hash checks. It deliberately rejects signed archives and cannot be cited as frozen signed-candidate evidence.

Run the exact frozen signed-candidate audit:

```sh
apps/ios/Tools/audit_release_privacy.sh signed-candidate /absolute/path/to/ZenbuJapanese.xcarchive
```

Signed-candidate mode fails unless the archive records a signing identity, embeds a provisioning profile, passes strict code-signature verification, and exposes a valid entitlement plist. The audit never suppresses signing, dependency-inspection, or scan execution failures. Credential denylist output reports only a category and packaged relative filename; it never prints matched contents.

Both archive modes inspect the resolved Mach-O dependency inventory, direct network-client symbols, embedded frameworks, reviewed public URL hosts, local/private URLs, DEBUG and test markers, non-Release resources, fixtures, private evidence markers, credential-shaped material, and the pinned release SBOM. `URLSession` is allowed only through the source-audited Frequency Pack and Japanese Text Analysis Pack boundaries; Network, CloudKit, WebKit, and raw socket clients remain denied. `ARTIFACT_SHA256` is derived from sorted packaged relative paths and file contents, so moving the same `.app` does not change its identity.

For a signed candidate, URL inventory strips `LC_CODE_SIGNATURE` from a scratch copy of the executable and excludes `_CodeSignature` plus `embedded.mobileprovision`. Those Apple-owned signing containers include certificate, OCSP, and revocation-list URLs that are not product network destinations. The original signed app is still verified strictly before the copy is made, and every ordinary packaged resource, compiled executable URL, and logical SQLite value remains in the product URL scan.

## Final candidate evidence

The Gate 3 owner must attach these results to issue #143 for the exact candidate commit and archive:

- Source audit output and dependency inventory.
- Release runtime network observation, with the test device, OS, duration, flows exercised, and observed destinations reported separately.
- Signed-candidate archive audit output, canonical application hash, privacy manifest, resolved libraries, signature verification, and signed entitlements. Unsigned preflight output is not a substitute.
- Physical-iPhone Camera first-use, denied, restricted, and unavailable results on the authorized iPhone 14 Pro Max, UDID `00008120-00040469019B401E`. Simulator injection may supplement but cannot replace the physical check.
- HTTPS 200 checks and screenshots for `https://zenbujapanese.com/support` and `https://zenbujapanese.com/privacy`.
- Secret-scan tool/version, commit, findings count, and disposition. Do not publish secret values.
- App Store Connect App Privacy read-back and publication screenshot after the final binary is frozen.
- Export-compliance determination after final dependencies and runtime network behavior are frozen.

Any candidate change after these results invalidates the affected evidence and requires a rerun.
