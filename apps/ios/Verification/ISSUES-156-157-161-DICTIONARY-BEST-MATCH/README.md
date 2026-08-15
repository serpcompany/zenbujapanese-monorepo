# Dictionary Best Match v1 manual QA checklist

Status: pending independent human review. This checklist does not record a completed HIL result and contains no private evidence paths or sealed replacement contexts.

Environment: authorized physical iPhone 14 Pro Max after automated simulator, Release, and archive gates are green. Use the exact candidate commit and record app build, iOS version, appearance, and orientation.

- [ ] From a clean Search root, enter `set`; verify the first Best Match is `セット` / `セット`, app-owned entry ID `e31152bffef387608184ec15e5ed6416` in diagnostic evidence, and opening the row shows that entry rather than `課する`.
- [ ] Verify the opened `セット` entry's Example Sentences belong to that selected entry. If the authorized reference evidence is available to the HIL owner, compare the complete visible sequence; do not substitute another entry's rows or report a private sequence publicly.
- [ ] Enter `light`; verify the first Best Match is `光` / `ひかり`, app-owned entry ID `07bdd5c3915e39200eee9c4f7a3e1b9b`, and opening the row does not select `灯す`.
- [ ] Verify the opened `光` entry's Example Sentences belong to that selected entry and follow the same private-evidence handling above.
- [ ] Enter `はし`; verify the first Best Match is `端` / `はし`, app-owned entry ID `8784500933ea7b27b14398efa769d7b8`, and opening the row does not select `箸`.
- [ ] Verify the opened `端` entry's Example Sentences belong to that selected entry and follow the same private-evidence handling above.
- [ ] Replay protected searches: `think` → `がる`, `hello` → `今日は`, `tabeta` → `食べる`, `makasete` → `任せる`, `問題` → `問題`, and `ねこ` → `猫`.
- [ ] Confirm Best Matches, Additional Matches, row navigation, Back restoration, recent Search behavior, Dictionary Sources attribution, and word notes remain operable.
- [ ] Record cold first-search and warm repeat-search responsiveness for one English and one Japanese query; report timing without inventing a release threshold.
- [ ] Record pass/fail and any first divergence on the owning issue. A failure creates a focused blocker; it does not authorize ranking tuning against a sealed replacement set.
