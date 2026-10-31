import type { SyncState } from '../shared/account-copy'

export const savedWordsLabels = {
  knownWords: 'Known Words',
  learning: 'Learning',
  lists: 'Lists',
  notes: 'Notes',
  kanji: 'Kanji',
  empty: {
    knownWords: {
      title: 'No Known Words',
      description:
        "Words and kanji you mark as Known in a word's ••• menu, or in the app, show here."
    },
    learning: {
      title: 'Nothing in Learning',
      description:
        "Words and kanji you mark as Learning in a word's ••• menu, or in the app, show here."
    },
    lists: {
      title: 'No Lists',
      description:
        "Make a list with Add to List… in a word's ••• menu, to keep words to come back to."
    },
    list: { title: 'No Words', description: "Add words from the ••• menu on a word's card." },
    listGone: {
      title: 'This list is gone',
      description: 'It was deleted, here or on another device.'
    },
    notes: { title: 'No Notes', description: 'Add a note to a word from its ••• menu.' }
  },
  sync: {
    lastSynced: 'Last Synced',
    notYet: 'Not Yet',
    syncing: 'Syncing…',
    waiting: 'Waiting to Sync',
    syncNow: 'Sync Now',
    tryAgain: 'Try Again',
    unread: "Couldn't read your saved words. Try again.",
    notes: {
      'subscription-required': 'Syncing needs the subscription.',
      offline: "Couldn't reach Zenbu. Check your connection and try again.",
      waiting: "Zenbu couldn't sync right now. It tries again soon.",
      failed: "The last sync didn't finish. Sync Now tries again."
    } satisfies Partial<Record<SyncState, string>> as Partial<Record<SyncState, string>>
  }
}
