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
show a sheet, and the iPhone leaves the Dynamic Type audit out of Apple's Image alert and of Image
Search's Text view, whose text is one size larger than the device's and whose rows the audit loses
as they are laid out again; there, Dynamic Type is checked by the text-clipped audit and the
largest-size pass. VoiceOver is by hand, on a device.

A linked word on a word's page, in a form's examples, and in a caption is at least 44 points tall,
and a tap or click anywhere in that height opens it, above kana without furigana too, on the Mac as
on the iPhone and iPad.

Check: UI `WordDetailUITests.testAMeaningShowsItsCheckedExample` (the middle of 吠える) and
`ExampleRowsUITests.testAConjugatedFormsExamplesArriveLinkedAndAWordOpens`.
