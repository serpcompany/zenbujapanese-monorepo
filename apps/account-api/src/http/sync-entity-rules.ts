import { bookmarkLimits } from '../domain/bookmarks'
import { watchLimits } from '../domain/watch-history'
import { listLimits } from '../domain/word-lists'
import { count } from './sync-fields'

interface OperationRule {
  baseVersion: boolean
  rule: string
  fields?: string
  example: { entityId?: string; baseVersion?: number; fields?: Record<string, unknown> }
}

export interface EntityRule {
  rule: string
  entityId: string
  data: string
  operations: Readonly<Record<string, OperationRule>>
}

const listId = '3b7f2c9e-5d1a-4e8b-9c6f-0a2d4e6f8b1c'
const videoId = 'a1B2c3D4e5F'
const sentenceId = '5e8d1c2b-7a6f-4d3e-8b9c-0f1e2d3c4b5a'
export const itemId = '9d2e4f6a8b0c1d3e5f7a9b1c3d5e7f90'
const learningItemId = '2b4d6f8a0c1e3f5a7b9d1f3a5c7e9b0d'
export const word = { headword: '見る', reading: 'みる' }

export const studyRules = {
  profile: {
    rule: "The account's name and username. `PATCH /v1/me` changes them by the same rule; the email doesn't change here.",
    entityId: "The account's ID, or left out.",
    data: 'Profile',
    operations: {
      update: {
        baseVersion: true,
        rule: "Name, username, or both. It applies only at the profile's current version, or conflicts with the profile as it is now; sending the current values again is applied and changes nothing.",
        fields: 'ProfileUpdateFields',
        example: { baseVersion: 1, fields: { name: 'Kana Fan', username: 'kana_fan' } }
      }
    }
  },
  knownWord: {
    rule: 'The learner\'s state for a word or a kanji: `unknown`, `learning`, or `known`, one at a time. An app that shows Learning changes it with `set`; `mark` and `clear` are for an app that sees only whether a word is known, and read a Learning word as not known. A word that goes back to Unknown stays, as a `put` with `state: "unknown"` and `known: false`.',
    entityId:
      'The item: a Language Reference ID (32 lowercase hex digits), or `kanji:` and one kanji, kept in Unicode NFC.',
    data: 'KnownWord',
    operations: {
      set: {
        baseVersion: true,
        rule: 'Moves the word to `state`, from any state to any other. It applies only if the word is still at `baseVersion` (0 for one the account never had), as `mark` and `clear` do, or conflicts with the word as it is now. Setting the state the word has is applied and changes nothing.',
        fields: 'WordStateFields',
        example: {
          entityId: learningItemId,
          baseVersion: 0,
          fields: { state: 'learning', headword: '食べる', reading: 'たべる' }
        }
      },
      mark: {
        baseVersion: true,
        rule: 'Makes the word Known, from Unknown or Learning: the same change as `set` with `state: "known"`. It applies only if the word is still at `baseVersion` (0 for one the account never had), so a mark made before the learner cleared the word loses to the clear, and one made after seeing it wins. Marking a known word is applied and changes nothing.',
        fields: 'WordFields',
        example: { entityId: itemId, baseVersion: 0, fields: word }
      },
      clear: {
        baseVersion: true,
        rule: 'Makes a known word Unknown. It applies only at the word\'s current version: a clear that never saw a later mark conflicts, and the word stays known. Clearing a word not known, a Learning one too, is applied and changes nothing, since the app that sends it can\'t see Learning; `set` with `state: "unknown"` ends Learning.',
        example: { entityId: itemId, baseVersion: 1 }
      }
    }
  },
  list: {
    rule: `A word list. An account holds at most ${count(listLimits.lists)}, and a deleted list's ID can't be used again.`,
    entityId: 'Its UUID, in either case; answers name it in lowercase.',
    data: 'WordList',
    operations: {
      create: {
        baseVersion: false,
        rule: `Rejected \`already_exists\` if the account has or had a list with that ID, and \`too_many_lists\` past ${count(listLimits.lists)}.`,
        fields: 'ListCreateFields',
        example: { entityId: listId, fields: { name: 'Food', position: 0 } }
      },
      update: {
        baseVersion: true,
        rule: 'A rename, a move, or both. It applies only at the current version, so two renames conflict and the second gets the list as it is now; one that already matches the list is applied. An update of a deleted list conflicts with the `delete`.',
        fields: 'ListUpdateFields',
        example: { entityId: listId, baseVersion: 1, fields: { name: 'Food and drink' } }
      },
      delete: {
        baseVersion: false,
        rule: "It always applies, wins over everything done to the list since, renames and words added elsewhere too, and takes the list's words with it: drop them on the device.",
        example: { entityId: listId }
      }
    }
  },
  listWord: {
    rule: `A word in a list. A list holds at most ${count(listLimits.wordsPerList)}.`,
    entityId: "The list's UUID, a slash, and the item: `<list>/<item>`.",
    data: 'ListWord',
    operations: {
      add: {
        baseVersion: false,
        rule: `It always applies to a list the account has. To a deleted or unknown list it's rejected \`unknown_list\`, and past ${count(listLimits.wordsPerList)} words \`list_full\`. Adding a word the list has is applied and changes nothing.`,
        fields: 'WordFields',
        example: { entityId: `${listId}/${itemId}`, fields: word }
      },
      remove: {
        baseVersion: true,
        rule: "It applies only at the word's current version, so it removes only an add it saw: an add the remover never saw wins, and the remove conflicts. Removing a word the list hasn't is applied.",
        example: { entityId: `${listId}/${itemId}`, baseVersion: 1 }
      }
    }
  },
  watchedVideo: {
    rule: `A video the learner watched in the iOS app's Player. The account keeps the ${watchLimits.videos} most recently watched, and remembers the latest ${watchLimits.goneKept} videos it removed or pruned.`,
    entityId: 'The YouTube video ID: 11 letters, digits, `-`, or `_`.',
    data: 'WatchedVideo',
    operations: {
      watch: {
        baseVersion: true,
        rule: `Send the whole video each time. A watch of a video the account has applies whatever its base version: the one with the later \`watchedAt\` sets the fields it sends, an older one sent late only fills fields the account lacks, and a field left out keeps the account's. A watch of a video the learner removed applies only at the removal's version, so one made before seeing the removal conflicts with the \`delete\`. A watch past the ${watchLimits.videos} newest prunes the oldest, which syncs as a \`delete\`.`,
        fields: 'WatchFields',
        example: {
          entityId: videoId,
          baseVersion: 0,
          fields: {
            watchedAt: '2026-10-07T03:17:00Z',
            title: '日本語の勉強',
            author: 'Zenbu',
            duration: 212,
            position: 30.5,
            comprehension: 0.42
          }
        }
      },
      remove: {
        baseVersion: false,
        rule: 'The learner removed the video. It always applies; removing one the account has not is applied and changes nothing.',
        example: { entityId: videoId }
      }
    }
  },
  bookmarkedSentence: {
    rule: `A sentence the learner bookmarked in the iOS app's Translate tab, alone: never its conversation. An account holds at most ${count(bookmarkLimits.bookmarks)}.`,
    entityId: "The sentence's UUID, in either case; answers name it in lowercase.",
    data: 'BookmarkedSentence',
    operations: {
      add: {
        baseVersion: false,
        rule: `It always applies; adding one the account has changes nothing, and past ${count(bookmarkLimits.bookmarks)} it's rejected \`too_many_bookmarks\`.`,
        fields: 'BookmarkFields',
        example: {
          entityId: sentenceId,
          fields: {
            text: '駅はどこですか',
            translation: 'Where is the station?',
            language: 'ja',
            bookmarkedAt: '2026-10-07T03:20:00Z'
          }
        }
      },
      remove: {
        baseVersion: true,
        rule: "It applies only at the bookmark's current version, so it removes only an add it saw: an add the remover never saw wins, and the remove conflicts. Removing one the account hasn't is applied.",
        example: { entityId: sentenceId, baseVersion: 1 }
      }
    }
  }
} satisfies Readonly<Record<string, EntityRule>>
