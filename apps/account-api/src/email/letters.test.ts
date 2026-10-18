import { describe, expect, test } from 'vitest'
import type { Language } from '../language'
import { accountDeletedMessage, signInAddedMessage, signInRemovedMessage } from './account-notices'
import type { Message } from './mailbox'
import { codeMinutes, signInCodeMessage } from './sign-in-code'

const to = 'learner@example.com'
const signature = '\n\nZenbu Japanese\nsupport@zenbujapanese.com'
const providers = ['apple', 'google', 'email']

const everyMessage = (language: Language): Message[] => [
  signInCodeMessage(to, '482913', language),
  ...providers.flatMap(provider => [
    signInAddedMessage(to, provider, language),
    signInRemovedMessage(to, provider, language)
  ]),
  accountDeletedMessage(to, language)
]

const bodyOf = (message: Message) => message.text.slice(0, -signature.length)

const withoutNames = (text: string) =>
  text
    .replace('support@zenbujapanese.com', '')
    .replace(/Zenbu Japanese|Zenbu(?=アカウント)|Apple|Google|\d+/g, '')

const sentencesOf = (text: string) =>
  text
    .split(/(?<=。)/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence !== '')

describe('the emails in English', () => {
  test('are word for word what they were before Japanese was added', () => {
    expect(signInCodeMessage(to, '482913', 'en')).toEqual({
      to,
      subject: 'Your Zenbu Japanese code: 482913',
      text: "Your code is 482913.\n\nEnter it in Zenbu Japanese within 10 minutes to sign in. If you didn't ask for it, you can ignore this email: no one can sign in without the code.\n\nZenbu Japanese\nsupport@zenbujapanese.com"
    })
    expect(signInAddedMessage(to, 'google', 'en')).toEqual({
      to,
      subject: 'A new way to sign in to Zenbu Japanese',
      text: "Sign in with Google can now sign in to your Zenbu Japanese account.\n\nIf you added it, there's nothing to do. If you didn't, sign in, remove it, and reply to this email so we can help.\n\nZenbu Japanese\nsupport@zenbujapanese.com"
    })
    expect(signInRemovedMessage(to, 'email', 'en')).toEqual({
      to,
      subject: 'A way to sign in to Zenbu Japanese was removed',
      text: "A code sent to this email no longer signs in to your Zenbu Japanese account.\n\nIf you removed it, there's nothing to do. If you didn't, sign in, check how you sign in, and reply to this email so we can help.\n\nZenbu Japanese\nsupport@zenbujapanese.com"
    })
    expect(accountDeletedMessage(to, 'en')).toEqual({
      to,
      subject: 'Your Zenbu Japanese account was deleted',
      text: "Your Zenbu Japanese account is deleted, with everything it kept in step between your apps.\n\nEach app keeps what is on its device and works signed out. Backups that still hold the account are deleted within 30 days.\n\nIf you didn't delete it, reply to this email so we can help.\n\nZenbu Japanese\nsupport@zenbujapanese.com"
    })
  })
})

describe('the emails in Japanese', () => {
  test('give the code, how long it lasts, and what to do without having asked, with the code in a Japanese subject', () => {
    const message = signInCodeMessage(to, '482913', 'ja')
    expect(message.subject).toBe('Zenbu Japaneseのログインコード：482913')
    expect(message.text).toContain('ログインコードは482913です。')
    expect(message.text).toContain(`${codeMinutes}分以内`)
    expect(message.text).toContain(
      'お心当たりがない場合は、このメールは無視していただいてかまいません。'
    )
    expect(message.text).toContain('コードがなければ、誰もログインできません。')
  })

  test("name Apple and Google as the website's buttons do, any other way by its ID, and the account as Zenbuアカウント", () => {
    expect(signInAddedMessage(to, 'apple', 'ja').text).toContain(
      'Zenbuアカウントに、ログイン方法「Appleでサインイン」が追加されました。'
    )
    expect(signInAddedMessage(to, 'google', 'ja').text).toContain('「Googleでログイン」')
    expect(signInRemovedMessage(to, 'email', 'ja').text).toContain(
      '「このメールアドレスに届くコード」では、Zenbuアカウントにログインできなくなりました。'
    )
    expect(signInRemovedMessage(to, 'passkey', 'ja').text).toContain('「passkey」')
    expect(accountDeletedMessage(to, 'ja').subject).toBe('Zenbuアカウントが削除されました')
  })

  test('say what the English says: the 30 days for backups, and replying for help', () => {
    const deleted = accountDeletedMessage(to, 'ja').text
    expect(deleted).toContain('30日以内に削除されます')
    for (const message of everyMessage('ja').slice(1)) {
      expect(message.text, message.subject).toContain('このメールにご返信ください。')
    }
  })

  test('are polite, sentence by sentence, in です・ます', () => {
    for (const message of everyMessage('ja')) {
      for (const sentence of sentencesOf(bodyOf(message))) {
        expect(sentence, message.subject).toMatch(/(です|ます|ません|ました|ください)。$/)
      }
    }
  })

  test('leave no English but Zenbu Japanese, Zenbuアカウント, the providers, and the support address', () => {
    for (const message of everyMessage('ja')) {
      expect(withoutNames(message.subject), message.subject).not.toMatch(/[A-Za-z]/)
      expect(withoutNames(bodyOf(message)), message.subject).not.toMatch(/[A-Za-z]/)
    }
  })
})

describe('every email, in either language', () => {
  test('goes to its recipient, signed with the product name and the support address', () => {
    for (const language of ['en', 'ja'] as const) {
      for (const message of everyMessage(language)) {
        expect(message.to).toBe(to)
        expect(message.text.endsWith(signature), message.subject).toBe(true)
      }
    }
  })
})
