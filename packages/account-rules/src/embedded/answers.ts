import { dailyListDay, dailyListId } from '../daily-lists'
import { listNameCutToFit } from '../lists'
import { keptNoteText, noteText } from '../notes'
import { accountName, accountUsername, usernameToSave } from '../profile'
import { signInCodeOf } from '../sign-in-code'
import { sentWatchMarks, type Watch } from '../watch'

const answers: Record<string, (argument: string) => unknown> = {
  accountName,
  accountUsername,
  usernameToSave,
  signInCode: signInCodeOf,
  listName: listNameCutToFit,
  dailyListId,
  dailyListDay,
  keptNoteText,
  noteText,
  sentWatches: watches => sentWatchMarks(JSON.parse(watches) as Watch[])
}

export function answer(rule: string, argument: string): unknown {
  const run = Object.hasOwn(answers, rule) ? answers[rule] : undefined
  if (!run) throw new Error(`The account rules have no ${rule}`)
  return run(argument)
}
