import { photoLimits } from '../domain/photo-files'
import { searchLimits } from '../domain/recent-searches'
import { settingRules, valueText } from '../domain/settings'
import { noteLimits } from '../domain/word-notes'
import { type EntityRule, itemId, word } from './sync-entity-rules'
import { count } from './sync-fields'

const noteId = '8a3e5c7b-1d2f-4a6b-9c8d-7e6f5a4b3c2d'
export const examplePhotoIds = {
  library: 'd20f6ffd523b78a86cd2f916fa34af5d1918d75f7b142237c752ad6b254213ab',
  profile: '02a3e298f1533f62558c58e4c70edcab9af5a50d62d925fd5390942020fb0fb8'
} as const
const photoWordId = `${examplePhotoIds.library}/${itemId}`
const searchId = '2b7ce3887f50f5f184c4a947e7b9492921788dce0df00aa6b446db01842836f1'

const settingList = Object.entries(settingRules)
  .map(([name, rule]) => `- \`${name}\` (${valueText(name)}): ${rule.means}`)
  .join('\n')

export const keptRules = {
  wordNote: {
    rule: `A note the learner wrote on a word or a kanji, or one an earlier app saved under a note identity no word takes now. A word may have several. An account holds at most ${count(noteLimits.notes)}. A deleted note's row keeps only its ID and version.`,
    entityId: "The note's UUID, in either case; answers name it in lowercase.",
    data: 'WordNote',
    operations: {
      write: {
        baseVersion: true,
        rule: `Writes the note whole: a new one at \`baseVersion\` 0, or a change to one at its current version. A write that matches the note is applied and changes nothing. A write at an older version conflicts with the note as it is now, so neither device's text is lost: keep yours as a new note on the same word, or, if \`current\`'s text is the one your change started from, write it again at \`current\`'s version. A write of a note deleted since \`baseVersion\` applies and brings it back: the deleter never saw that text. Past ${count(noteLimits.notes)} notes it's rejected \`too_many_notes\`.`,
        fields: 'NoteFields',
        example: {
          entityId: noteId,
          baseVersion: 0,
          fields: { item: itemId, text: '「見る」は目で、「観る」は映画を。', ...word }
        }
      },
      delete: {
        baseVersion: true,
        rule: "It applies only at the note's current version, so it deletes only what the learner saw: a note written elsewhere since stays, and the delete conflicts. Deleting a note the account hasn't is applied.",
        example: { entityId: noteId, baseVersion: 1 }
      }
    }
  },
  photo: {
    rule: `A photo in the learner's Media Library, by its file, which \`PUT /v1/photos/{photoId}\` uploads first and \`GET /v1/photos/{photoId}\` downloads. The account keeps the bytes as the app sent them. A photo stays while it's on a word: removing its last word deletes it, as the app does.`,
    entityId: "The SHA-256 of the photo's file, in 64 lowercase hex digits.",
    data: 'Photo',
    operations: {
      add: {
        baseVersion: false,
        rule: 'It always applies, once the account holds the file (else `photo_not_uploaded`): the same photo saved again after a delete comes back. Adding one the account has changes nothing. Send its words next, as `photoWord` adds.',
        fields: 'PhotoFields',
        example: {
          entityId: examplePhotoIds.library,
          fields: { name: 'Menu.jpg', savedAt: '2026-10-07T03:25:00Z' }
        }
      },
      delete: {
        baseVersion: false,
        rule: "The learner deleted the photo. It always applies, wins over everything done to the photo since, words added elsewhere too, and takes the photo's words and its file with it, unless the profile photo is the same file: drop them on the device.",
        example: { entityId: examplePhotoIds.library }
      }
    }
  },
  photoWord: {
    rule: `A word or kanji a photo is on. A photo is on at most ${photoLimits.wordsPerPhoto} words. Adding a word journals its photo again, so a device that dropped the photo gets it back with the word.`,
    entityId:
      "The photo's SHA-256, a slash, and the item: `<photo>/<item>`, the item as a note's is.",
    data: 'PhotoWord',
    operations: {
      add: {
        baseVersion: false,
        rule: `It always applies to a photo the account has. To a deleted or unknown photo it's rejected \`unknown_photo\`, and past ${photoLimits.wordsPerPhoto} words \`photo_full\`. Adding a word the photo is on is applied and changes nothing.`,
        fields: 'PhotoWordFields',
        example: { entityId: photoWordId, fields: { ...word, savedAt: '2026-10-07T03:25:00Z' } }
      },
      remove: {
        baseVersion: true,
        rule: "It applies only at the word's current version, so an add the remover never saw wins, and the remove conflicts. Removing the photo's last word deletes the photo too, which syncs as the photo's `delete`.",
        example: { entityId: photoWordId, baseVersion: 1 }
      }
    }
  },
  profilePhoto: {
    rule: "The profile's photo, a file uploaded with `PUT /v1/photos/{photoId}`. The name and username stay the profile's own, so changing one never conflicts with the other.",
    entityId: "The account's ID, or left out.",
    data: 'ProfilePhoto',
    operations: {
      set: {
        baseVersion: true,
        rule: "It applies only at the profile photo's current version (0 for none ever set), so two devices that change it conflict, and the second gets the photo as it is now. Setting the photo it has is applied and changes nothing. The file it replaces is deleted, unless a Media Library photo is the same file.",
        fields: 'ProfilePhotoFields',
        example: { baseVersion: 0, fields: { photoId: examplePhotoIds.profile } }
      },
      remove: {
        baseVersion: true,
        rule: 'It applies only at the current version, so a photo set elsewhere since stays, and the remove conflicts. It syncs as a `delete`.',
        example: { baseVersion: 1 }
      }
    }
  },
  setting: {
    rule: `One of the learner's settings, which follow the account rather than the device. A setting the account doesn't hold comes as a \`delete\`. The settings:\n\n${settingList}`,
    entityId: "The setting's name, from the list above.",
    data: 'Setting',
    operations: {
      set: {
        baseVersion: true,
        rule: "It applies only at the setting's current version (0 for one never set), so two devices that change one setting conflict, and the second gets the value as it is now; settings change apart, so changing one never conflicts with another. Setting the value it has is applied and changes nothing. A name the service doesn't know is rejected `unknown_setting`, and a value out of its kind `invalid_fields`: keep the device's value either way.",
        fields: 'SettingFields',
        example: { entityId: 'readingAids.furigana', baseVersion: 0, fields: { value: false } }
      }
    }
  },
  recentSearch: {
    rule: `A search the learner made, as the app's recent searches list it. The account keeps the ${searchLimits.kept} with the latest \`searchedAt\`, and remembers the latest ${searchLimits.goneKept} it removed or pruned, as it does Player's Recent.`,
    entityId:
      'The SHA-256 of the query in UTF-8, after Unicode NFC, in 64 lowercase hex digits, so one query is one entity on every device.',
    data: 'RecentSearch',
    operations: {
      search: {
        baseVersion: true,
        rule: `A search of a query the account has applies whatever its base version, and the later \`searchedAt\` is kept. A search of a query the learner removed applies only at the removal's version, so one made before seeing the removal conflicts with the \`delete\`. A search past the ${searchLimits.kept} newest prunes the oldest, which syncs as a \`delete\`.`,
        fields: 'SearchFields',
        example: {
          entityId: searchId,
          baseVersion: 0,
          fields: { query: '食べる', searchedAt: '2026-10-07T03:30:00Z' }
        }
      },
      remove: {
        baseVersion: false,
        rule: 'The learner removed the search, or cleared them all, one `remove` each. It always applies; removing one the account has not is applied and changes nothing.',
        example: { entityId: searchId }
      }
    }
  }
} satisfies Readonly<Record<string, EntityRule>>
