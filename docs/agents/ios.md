# iOS working guide

## Build and inspect

Use XcodeBuildMCP to discover the project, scheme, and an already-booted iOS
Simulator from the current checkout. Build and run with the `arm64` architecture,
then inspect the launched app before reporting success.

The current `sudachi-swift` binary lacks an x86_64 Simulator slice. Use
`ONLY_ACTIVE_ARCH=YES`; a generic dual-architecture Simulator build fails at
link time.

## Interactive parsing comparison harness

The app defaults to the bundled Kuromoji engine for interactive Japanese in Image Search,
Word Detail, and Example Sentences. Dictionary search segmentation continues to use Sudachi.

To compare the previous interactive parsing path, launch the app with
`ZENBU_MORPHOLOGY_ENGINE=sudachi`. Omit the variable, or use any other value, to exercise
Kuromoji. Keep `ONLY_ACTIVE_ARCH=YES` for either path.

Compare both paths with the same source text and check:

- visible word boundaries and separate underline geometry;
- dictionary resolution for surface, normalized, and dictionary forms;
- candidate selection and the explicit no-entry state;
- the large Word Detail sheet and its **Open Full Entry** route; and
- linked-word behavior in Word Detail and Example Sentences.

This switch is a local comparison harness. It does not change the TestFlight engine, which
uses the default Kuromoji path.

## Current verification boundary

This repository currently has no test targets or CI workflows. Issue [#329](https://github.com/serpcompany/zenbujapanese-monorepo/issues/329) owns the clean-slate replacement strategy. Verify ordinary changes by building and launching the real app; add test or CI infrastructure only through approved follow-up work from that strategy.
