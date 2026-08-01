# Connection-probe semantic evidence

Captured: 2026-08-01T16:42:57Z
Authority: `nihongo-ios-1.34.3-9792-runtime`

## Available accessibility structure

iPhone Mirroring exposed only its macOS shell to computer-use:

```text
Window: "iPhone Mirroring", App: iPhone Mirroring
- standard window (iphone-mirroring-main)
  - container
  - close button
  - zoom button (disabled)
  - minimize button
  - Home Screen button (app.grid.3x3)
  - App Switcher button (iphone.app.switcher)
```

The tree contained no Nihongo labels, fields, buttons, traits, identifiers, focus order, or hierarchy.

## Accessibility Inspector attempt

Xcode Accessibility Inspector 26.0 listed and selected the connected physical iPhone target. Activating its element-selection scope did not return a Nihongo element or hierarchy. A pointer action against the mirrored Search field affected the runtime instead of populating the inspector, so the probe stopped.

## Limitation and fallback

Status: `app_semantics_unavailable_with_current_automation`

Owner: discovery driver with device-owner assistance.

Fallback procedure:

1. Keep the exact authority and environment recorded in `reference-authorities.json`.
2. Retry Xcode Accessibility Inspector with Nihongo foregrounded and iPhone Mirroring disconnected if later capture work can do so without losing visual control.
3. If app-level elements remain unavailable, run a device-owner-assisted VoiceOver traversal for each approved Search surface and record spoken labels, traits, ordering, actions, and focus transitions without personal content.
4. Mark every affected accessibility inventory row blocked until one of those procedures supplies environment-bound evidence.

This limitation does not prevent visual and interaction reconnaissance, but screenshots must not be described as semantic evidence.
