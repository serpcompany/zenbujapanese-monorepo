import { listNameCutToFit } from '../lists'
import { keptNoteText, noteText } from '../notes'
import { accountName, accountUsername, removesTheUsername } from '../profile'
import { signInCodeOf } from '../sign-in-code'
import { fitsTheWatch, type WatchNumber, watchText } from '../watch'

const answers: Record<string, (argument: string) => string | boolean | null> = {
  accountName,
  accountUsername,
  removesTheUsername,
  signInCode: signInCodeOf,
  listName: listNameCutToFit,
  keptNoteText,
  noteText,
  watchText,
  fitsTheWatch: request => {
    const [field, value] = JSON.parse(request) as [WatchNumber, unknown]
    return fitsTheWatch(field, value)
  }
}

export function answer(rule: string, argument: string): string | boolean | null {
  const run = Object.hasOwn(answers, rule) ? answers[rule] : undefined
  if (!run) throw new Error(`The account rules have no ${rule}`)
  return run(argument)
}
