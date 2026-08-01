# Nihongo Search reachability map

Authority: installed Nihongo 1.34.3 (9792) on the connected iPhone 17 Pro Max, iOS 26.5.2, dark appearance, portrait orientation. This is a reconnaissance graph, not an exhaustive state-capture claim. All 16 candidate journeys and 17 candidate blocking or navigation-support surfaces remain `proposed` until issue #66 approves their classification.

```mermaid
flowchart TD
    ROOT[LOOKUP-SEARCH-ROOT]
    HISTORY[LOOKUP-SEARCH-HISTORY]
    MENU[LOOKUP-IMAGE-SOURCE-MENU]
    HAND[LOOKUP-HANDWRITING-INPUT]
    RAD[LOOKUP-RADICAL-INPUT]
    RESULTS[LOOKUP-RESULTS]
    EXAMPLES[LOOKUP-EXAMPLE-SENTENCES]
    WORD[LOOKUP-WORD-DETAIL]
    NOTE[LOOKUP-NOTE-EDITING]
    CONJ[LOOKUP-CONJUGATIONS]
    KANJI[LOOKUP-KANJI-DETAIL]
    STROKE[LOOKUP-STROKE-ORDER-OVERLAY]
    ELEMENT[LOOKUP-KANJI-ELEMENT-DETAIL]
    CAMERA[IOS-CAMERA-CAPTURE]
    PHOTOS[IOS-PHOTO-LIBRARY-PICKER]
    FILES[IOS-FILES-PICKER]
    IMAGE[LOOKUP-IMAGE-TEXT-RESULT]
    CLIP[BOUNDARY-CLIPPINGS]
    FLASH[BOUNDARY-FLASHCARDS]
    SETTINGS[BOUNDARY-SETTINGS]
    EDITOR[BOUNDARY-FLASHCARD-EDITOR]

    ROOT -->|focus empty Search| HISTORY
    HISTORY -->|recent row| RESULTS
    ROOT -->|type Japanese, English, or romaji| RESULTS
    ROOT -->|input mode| HAND
    ROOT -->|input mode| RAD
    HAND <-->|mode switch| RAD
    HAND -.->|submit; not yet captured| RESULTS
    RAD -.->|submit; not yet captured| RESULTS
    ROOT -->|image-source button| MENU
    MENU -.->|Take Photo; protected| CAMERA
    MENU -.->|Photo Library; protected| PHOTOS
    MENU -.->|Files; protected| FILES
    CAMERA -.->|OCR; not observed| IMAGE
    PHOTOS -.->|OCR; not observed| IMAGE
    FILES -.->|OCR; not observed| IMAGE
    RESULTS -->|result row| WORD
    RESULTS -->|View Example Sentences| EXAMPLES
    EXAMPLES -->|linked token| WORD
    WORD -->|Add Note| NOTE
    WORD -->|View Conjugations| CONJ
    WORD -->|linked kanji| KANJI
    KANJI -->|stroke-order control| STROKE
    KANJI -->|element card| ELEMENT
    ELEMENT -->|linked kanji| KANJI
    KANJI -->|reading or related word| WORD
    WORD -->|editing toolbar| EDITOR
    ROOT -->|reference tab| CLIP
    ROOT -->|reference tab| FLASH
    ROOT -->|reference tab| SETTINGS

    classDef protected stroke-dasharray: 5 5;
    classDef excluded fill:#3a2630,stroke:#c56,color:#fff;
    class CAMERA,PHOTOS,FILES,IMAGE protected;
    class CLIP,FLASH,SETTINGS,EDITOR excluded;
```

Solid edges were traversed at runtime except the three excluded bottom-tab edges, whose entry controls were observed but intentionally not selected. Dashed edges require synthetic fixtures or further capture. The Flashcard editor boundary was entered only far enough to identify it, then immediately exited; its contents were not catalogued.

## Reconnoitred content and controls

- Search supports normal keyboard input plus handwriting and radical panels. Romaji may first rank literal Latin-script matches and offer a Japanese-reading refinement.
- Results expose Best Matches, Additional Matches, and a query-specific Example Sentences action. Cancelling a populated search can leave the result set visible after focus and query text clear.
- Word Detail can expose reading, frequency, pitch-accent visualization, audio, parts of speech, meanings, alternatives, linked kanji and words, notes, examples, and conjugations.
- Example Sentences show Japanese with furigana, English translation, audio, and linked Japanese tokens.
- Kanji Detail exposes classifications, meanings, readings linked to words, elements, expandable origin/history, related words, and a stroke-order overlay. Element Detail links outward to kanji grouped by the element's role.

## Privacy and evidence limits

- No retained screenshot contains pre-existing recent-search terms, personal photos, personal files, or clipboard data.
- The retained handwriting and radical screenshots contain only the lower input panels.
- Camera, Photo Library, Files, image OCR/result, audio behavior, destructive history clearing, permission variants, offline/error/retry paths, and relaunch persistence are mapped but not characterized.
- Zenbu's natural-translation addition belongs to the settled Image Text Flow product authority. It must not be represented as observed Nihongo behavior.

Machine-readable details live in `journeys.json`, `surface-map.json`, and `state-transitions.json`.
