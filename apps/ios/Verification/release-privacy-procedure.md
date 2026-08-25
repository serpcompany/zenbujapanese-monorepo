# Release privacy verification

This is the reusable procedure for evaluating an iOS release candidate. It
keeps source inspection, unsigned archive preflight, runtime observation, and
signed-candidate inspection as separate evidence layers. Passing one layer
does not substitute for another.

Version-specific data inventory, hashes, outcomes, and operational evidence
belong in the corresponding release record. See the frozen
[Zenbu Japanese 1.0 privacy audit results](../../../docs/releases/1.0.0/verification/privacy-audit-results.md).

## Source audit

Run the source and bundled-data contract from the repository root:

```sh
apps/ios/Tools/audit_release_privacy.sh source
```

This verifies the privacy manifest, required-reason API declaration, target
membership, prohibited network/dependency patterns, public links, and canonical
bundled language-data contracts. Its result is source evidence only.

## Unsigned archive preflight

Run an explicitly unsigned Release archive preflight while iterating locally:

```sh
apps/ios/Tools/audit_release_privacy.sh unsigned-preflight /absolute/path/to/ZenbuJapanese.xcarchive
```

This mode proves packaging, dependency, URL, DEBUG-resource, private-evidence,
credential-pattern, manifest, and canonical-hash checks. It deliberately
rejects signed archives and cannot be cited as frozen signed-candidate evidence.

## Signed-candidate audit

Run the frozen signed candidate through the strict audit:

```sh
apps/ios/Tools/audit_release_privacy.sh signed-candidate /absolute/path/to/ZenbuJapanese.xcarchive
```

Signed-candidate mode fails unless the archive records a signing identity,
embeds a provisioning profile, passes strict code-signature verification, and
exposes a valid entitlement plist. The audit never suppresses signing,
dependency-inspection, or scan execution failures. Credential denylist output
reports only a category and packaged relative filename; it never prints matched
contents.

Both archive modes inspect the resolved Mach-O dependency inventory, direct
network-client symbols, embedded frameworks, reviewed public URL hosts,
local/private URLs, DEBUG and test markers, non-Release resources, fixtures,
private evidence markers, and credential-shaped material. `ARTIFACT_SHA256` is
derived from sorted packaged relative paths and file contents, so moving the
same `.app` does not change its identity.

For a signed candidate, URL inventory strips `LC_CODE_SIGNATURE` from a scratch
copy of the executable and excludes `_CodeSignature` plus
`embedded.mobileprovision`. Those Apple-owned signing containers include
certificate, OCSP, and revocation-list URLs that are not product network
destinations. The original signed app is still verified strictly before the
copy is made, and every ordinary packaged resource, compiled executable URL,
and logical SQLite value remains in the product URL scan.

## Candidate evidence checklist

Record these items for the exact candidate commit and archive in its release
record and operational release issue:

- Source audit output and dependency inventory.
- Release runtime network observation, with device, OS, duration, exercised
  flows, and observed destinations reported separately.
- Signed-candidate audit output, canonical application hash, privacy manifest,
  resolved libraries, signature verification, and signed entitlements.
- Physical-device Camera first-use, denied, restricted, and unavailable results.
- Availability checks for the release's support and privacy URLs.
- Secret-scan tool/version, commit, findings count, and disposition without
  publishing secret values.
- App Store Connect App Privacy read-back after the final binary is frozen.
- Export-compliance determination after dependencies and runtime network
  behavior are frozen.

Any candidate change after these results invalidates the affected evidence and
requires a rerun.
