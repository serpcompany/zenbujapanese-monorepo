import type { Message } from './mailbox'

export const codeMinutes = 10

export function signInCodeMessage(to: string, code: string): Message {
  return {
    to,
    subject: `Your Zenbu Japanese code: ${code}`,
    text: [
      `Your code is ${code}.`,
      '',
      `Enter it in Zenbu Japanese within ${codeMinutes} minutes to sign in. If you didn't ask for it, you can ignore this email: no one can sign in without the code.`,
      '',
      'Zenbu Japanese',
      'support@zenbujapanese.com'
    ].join('\n')
  }
}
