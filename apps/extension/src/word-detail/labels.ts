const pronounce = {
  unsupported: "This browser can't pronounce Japanese.",
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
  conjugations: {
    modeLabel: 'Conjugation mode',
    loading: 'Loading examples',
    failed: 'Examples couldn’t load. Try again later.',
    showsConjugations: ', shows conjugations',
    rowLabel: '{title}, {surface}, {reading}'
  },
  entries: 'Entries',
  copyFailed: "Couldn't copy. Try again.",
  meaning: {
    actions: 'Actions for meaning {number}',
    speak: 'Speak',
    copy: 'Copy',
    copied: 'Meaning copied',
    unsupported: "This browser can't speak English."
  },
  share: {
    share: 'Share {name}',
    moreActions: 'More actions for {name}',
    copyLink: 'Copy Link',
    linkCopied: 'Link copied'
  },
  strokes: {
    downloading: 'Stroke order is downloading. It shows here once it has.'
  },
  lookup: {
    failed: "The dictionary couldn't answer. Try again.",
    tryAgain: 'Try again',
    wordNotFound: "This word isn't in the dictionary.",
    kanjiNotFound: "This kanji isn't in the dictionary.",
    spellingNotFound: '{headword} isn’t in the dictionary.'
  }
}
