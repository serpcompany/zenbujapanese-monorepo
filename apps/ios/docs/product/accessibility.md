# Accessibility

Every screen follows the device's text size up to the largest accessibility size, and every
control has a target of at least 44 by 44 points, except a word linked inside a sentence, which is
as tall as the text it is part of. The exceptions, each with its reason, are in
[`ios-accessibility.md`](../../../../docs/agents/ios-accessibility.md); contrast is measured there
but not yet held to a ratio.

Check: UI `SearchAuditUITests`, `TranslateAuditUITests`, `PlayerAuditUITests`, and
`AccountAuditUITests` audit every screen at the default text size, in light and in dark, and at the
largest size in light, and `ShareSheetAuditUITests` the share sheet's card for a sentence and for a
photo the same way on the iPhone and iPad; the card for a word isn't audited yet. The Mac has no
largest size. The iPad doesn't run the Dynamic Type and text-clipped audits, which hang its tab bar,
so those two are checked on the iPhone; it also leaves element detection out of the screens that
show a sheet, and the iPhone leaves the Dynamic Type audit out of Apple's Image alert. VoiceOver is
by hand, on a device.
