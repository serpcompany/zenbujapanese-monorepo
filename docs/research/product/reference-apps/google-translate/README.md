# Google Translate live-conversation reference

Status: current product-reference evidence; not a complete specification

Captured: 2026-07-31

App version: not recorded

Provenance: screenshots captured by the product owner from the Google Translate iOS app

## Observed behavior

The captured **Live translation modes** UI includes:

- **Listening**: real-time translations in the user's language play through connected headphones.
- **Conversation**: participants take turns speaking and translations play through the phone.
- **Text only**: translations remain visible and no audio plays.
- **Custom settings**: audio output is configured independently for each language.

The custom audio controls visibly allow each language to route to:

- muted
- the device speaker
- connected headphones

These screenshots establish per-language headphone assignment: either one language or both languages can be sent to connected headphones.

They do not fully establish the physical listening behavior behind that assignment—for example, whether audio uses both earbuds, separate left/right channels, one earbud per participant, multiple connected listening devices, or some other routing arrangement. A later hands-on audit must document the actual supported hardware, setup flow, channel behavior, microphone source, and participant experience.

## Screenshots

- [Mode selector](screenshots/google-translate-live-translation-mode-selector.png)
- [Conversation-mode routing](screenshots/google-translate-conversation-mode-audio-routing.png)
- [Listening mode with headphones](screenshots/google-translate-listening-mode-headphones.png)
- [Custom per-language audio routing](screenshots/google-translate-custom-per-language-audio-routing.png)

These images are focused evidence for live-conversation mode selection and audio routing. They are not an exhaustive audit of Google Translate.
