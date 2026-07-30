# Normalize language data behind app-owned boundaries

Zenbu Japanese Product Experiences will depend on app-owned language models and focused capability interfaces rather than the schema or API of a particular dictionary, dataset, or algorithm. Dataset adapters will normalize each source into the canonical local model while retaining provenance; replaceable runtime algorithms such as tokenization or OCR will sit behind focused capability interfaces.

This keeps Lookup, Media Analysis, Read, Watch, Listen, and future experiences consistent when a source or implementation changes. It does not select any concrete dictionary, dataset, tokenizer, or provider, and it does not introduce a general-purpose plugin system before real alternatives require one.
