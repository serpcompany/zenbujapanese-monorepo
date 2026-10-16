import type { Language } from '../domain/language'
import { type Letter, signed } from './letter'
import type { Message } from './mailbox'

export const codeMinutes = 10

const letters: Record<Language, (code: string) => Letter> = {
  en: code => ({
    subject: `Your Zenbu Japanese code: ${code}`,
    paragraphs: [
      `Your code is ${code}.`,
      `Enter it in Zenbu Japanese within ${codeMinutes} minutes to sign in. If you didn't ask for it, you can ignore this email: no one can sign in without the code.`
    ]
  }),
  ja: code => ({
    subject: `Zenbu Japaneseのログインコード：${code}`,
    paragraphs: [
      `ログインコードは${code}です。`,
      `Zenbu Japaneseでこのコードを${codeMinutes}分以内に入力して、ログインしてください。お心当たりがない場合は、このメールは無視していただいてかまいません。コードがなければ、誰もログインできません。`
    ]
  })
}

export function signInCodeMessage(to: string, code: string, language: Language): Message {
  return signed(to, letters[language](code))
}
