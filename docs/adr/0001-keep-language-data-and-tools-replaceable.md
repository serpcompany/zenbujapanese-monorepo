---
status: accepted
---

# Keep language data and tools replaceable

Zenbu's screens and features should use data structures owned by Zenbu instead of depending directly on the format used by a particular dictionary, dataset, or third-party tool.

When Zenbu imports language data, it converts that data into its own format while preserving where the information came from and how it is licensed. Replaceable tools, such as OCR and Japanese text analysis, are kept behind small, focused interfaces so they can be changed without rewriting unrelated parts of the app.

Replaceable does not mean that changing a dependency requires no work. A change may still require a new importer, data migration, license review, or behavior review. The goal is to keep that work at the dependency boundary instead of spreading provider-specific details throughout the app.

This decision does not choose a particular dictionary or language-processing tool. It also does not require one universal adapter or a general plugin system. Add a focused adapter only when Zenbu has a real dependency to isolate.
