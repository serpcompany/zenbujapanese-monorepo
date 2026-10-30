const pronounce = {
  unsupported: 'This browser can’t pronounce Japanese.',
  withPitch: '{pronounce}. {pitch}'
}

const examples = {
  pronounce: 'Pronounce sentence',
  possibleEntries: '{count} possible entries',
  more: 'Load more examples',
  loading: 'Loading examples…',
  stale: 'These examples have been updated since the page loaded.',
  reload: 'Reload for more examples',
  retry: 'Try again',
  romajiUnavailable: 'Romaji unavailable for this text'
}

const saving = {
  status: 'Status',
  states: { unknown: 'Unknown', learning: 'Learning', known: 'Known' },
  tags: { learning: '◐ Learning', known: '✓ Known' },
  addToList: 'Add to List…',
  back: 'Back',
  newList: 'New List',
  listName: 'Name',
  create: 'Create',
  cancel: 'Cancel',
  addNote: 'Add Note',
  lists: 'Lists',
  noLists: 'No list holds it yet.',
  note: 'Note on {name}',
  signedOut: {
    title: 'Sign in to save words',
    text: 'Known words, lists and notes save to your Zenbu account and sync with the app.',
    action: 'Sign In'
  },
  subscription: {
    title: 'Saving needs the subscription',
    text: 'With it, known words, lists and notes sync between this browser and the app.',
    action: 'Subscribe…'
  },
  known: {
    title: '{name} is known',
    text: 'Its underline is gone from every page and video.',
    action: 'Undo'
  }
}

export const wordDetailLabels = {
  lang: 'en',
  word: {
    kanjiRowLabel: '{character}, {meaning}, shows kanji details',
    formSeparator: ', ',
    formLabels: '({labels})',
    labelSeparator: ', '
  },
  frequency: {
    spokenTier: ', {tier}',
    detailsTitle: 'Frequency Details',
    domain: 'Domain',
    version: 'Version',
    source: 'Source',
    done: 'Done'
  },
  chrome: { close: 'Close' },
  pronounce,
  examples,
  saving,
  conjugations: {
    modeLabel: 'Conjugation mode',
    loading: 'Loading examples',
    failed: 'Examples couldn’t load. Try again later.',
    showsConjugations: ', shows conjugations',
    rowLabel: '{title}, {surface}, {reading}'
  },
  entries: 'Entries',
  copyFailed: 'Couldn’t copy. Try again.',
  meaning: {
    actions: 'Actions for meaning {number}',
    speak: 'Speak',
    copy: 'Copy',
    copied: 'Meaning copied',
    unsupported: 'This browser can’t speak English.'
  },
  share: {
    share: 'Share {name}',
    moreActions: 'More actions for {name}',
    linkCopied: 'Link copied',
    openOnWebsite: 'Open on zenbujapanese.com'
  },
  strokes: {
    downloading: 'Stroke order is downloading. It shows here once it has.'
  },
  lookup: {
    failed: 'The dictionary couldn’t answer. Try again.',
    tryAgain: 'Try again',
    wordNotFound: 'This word isn’t in the dictionary.',
    kanjiNotFound: 'This kanji isn’t in the dictionary.',
    spellingNotFound: '{headword} isn’t in the dictionary.'
  }
}
