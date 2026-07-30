# Zenbu Translator Product Idea

The purpose of this app is to give the user a utility for naturally translating text, and having real time conversations between english<->japanese and japanese<->english. 

## Competitor references

- https://translator.owll.ai/ // https://apps.apple.com/us/app/owll-translator-ai-voice-clone/id6742527823
- https://apps.apple.com/jp/app/timekettle/id1485347374
- https://apps.apple.com/us/app/google-translate/id414706506


## Features

The core (MVP included) features would include similar functionality and UI of the competitor references including:

- real time conversation translation (2 Speakers, one english one japanese)
- SpeakerA audio input -> speech-to-text transcribed in real time in the UI in the spoken language, and translated in the destination language for SpeakerB to read
- Audio input -> text-to-speech & "read" audibly in the destination language
- speaker phone mode (conversation is dictated --> read audibly turn based on the phones speaker phone)
- silent phone mode (conversation is dictated --> but 'muted' (no audible output))
- split-headphone mode (SpeakerA uses one headphone from a pair (ex: "Left" headphone) and SpeakerA's dialogue is read aloud to SpeakerB in the "Right" headphone in SpeakerB's translated language)
- full conversation context: japanese is inherently inaccurate to traslate without full context because of how much context (pronouns, etc.) is inferred/omitted, so we need a solution to this -- possibly providing the full context of the conversation to the AI TRANSLATION MODEL with each message so it can keep the same context a human would and provide more accurate translations
- saved conversation history
- ... other core features of the "Competitor references" that might have been left out of this initial list


## MVP Goals

A good "MVP" goal would be the 'real time conversation' UI/UX/Features of the 'https://apps.apple.com/jp/app/timekettle/id1485347374' app conversation mode.