# Zenbu Japanese icon pack

Production exports of the selected pop-sticker `全` icon.

- Primary red: `#BC002D`
- Master size: 4096 × 4096
- Master background: transparent
- iOS and store icons: opaque white, because Apple rejects alpha in App Store icons
- Android maskable icons: artwork reduced to a conservative safe zone

## What is included

### `master/`

- Transparent PNG masters at 4096, 2048, 1024, and 512px
- Lossless WebP
- AVIF

### `vector/`

- `zenbu-icon-flat-vector.svg`: true flat vector using charcoal, white, and exact `#BC002D`
- `zenbu-icon-fullcolor.svg`: raster-backed SVG preserving the original generated shading exactly
- `safari-pinned-tab.svg`: true one-color vector silhouette

Use the flat vector for responsive website artwork, print, and future edits. Use the raster-backed SVG only when exact visual parity with the generated PNG matters.

### `extensions/`

Transparent PNGs at 16, 19, 20, 24, 32, 38, 48, 64, 96, 128, and 256px. The included example shows the `manifest.json` icon mapping for Chrome, Edge, and Firefox.

### `web/`

- Multi-resolution `favicon.ico`
- 16, 32, and 48px favicon PNGs
- 180px opaque Apple touch icon
- PWA icons at 192 and 512px
- Separate maskable PWA icons at 192 and 512px
- Drop-in web manifest, favicon HTML, and Windows browser configuration
- Social avatars at 400, 512, 800, 1024, and 1080px
- Open Graph image at 1200 × 630
- Twitter/X card at 1200 × 675

Update the example URL paths if the files are served from a directory other than `/` or `/icons/`.

### `ios/AppIcon.appiconset/`

A complete opaque iPhone/iPad AppIcon set with `Contents.json`. Copy the entire folder into an Xcode asset catalog. Xcode applies the platform corner mask; do not round the files manually.

### `android/`

- Legacy launcher PNGs for mdpi through xxxhdpi
- Safe-zone adaptive foreground PNGs for mdpi through xxxhdpi
- Adaptive-icon XML and background color resource
- Opaque 512px Google Play Store icon

Copy the density folders and `mipmap-anydpi-v26` directory into `app/src/main/res/`. Merge `values/colors.xml` if the project already has one.

### `macos/`

Standard `.iconset` files plus a ready-to-use `Zenbu.icns`.

### `windows/`

Opaque square tile assets at 44, 71, 150, and 310px.

## Recommended defaults

- Website header/logo artwork: `vector/zenbu-icon-flat-vector.svg`
- Favicon: `web/favicons/favicon.ico`
- Browser extension: 16, 32, 48, and 128px PNGs
- Social avatar: `web/social/avatar-1080x1080.png`
- iOS: copy `ios/AppIcon.appiconset/`
- Android: use `android/adaptive/` plus the Play Store icon

## Important production note

The original concept was generated as raster artwork. The flat SVG is an automatic color-layer vectorization and is visually faithful, but a brand designer should still inspect and refine its paths before large-format print, trademark filing, or permanent master-logo adoption.
