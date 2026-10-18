# Accessibility

Every screen follows the device's text size up to the largest accessibility size, in light and
dark, and every control has a target of at least 44 by 44 points. The exceptions, each with its
reason, are in [`ios-accessibility.md`](../../../../docs/agents/ios-accessibility.md); contrast is
measured there but not yet held to a ratio.

Check: UI `SearchAuditUITests`, `TranslateAuditUITests`, `PlayerAuditUITests`, and
`AccountAuditUITests` (every screen, at the default and largest text sizes and in dark). VoiceOver
is by hand, on a device.
