import type { Message } from './mailbox'

const ways: Record<string, string> = {
  apple: 'Sign in with Apple',
  google: 'Sign in with Google',
  email: 'A code sent to this email'
}

const signature = ['', 'Zenbu Japanese', 'support@zenbujapanese.com']

export function signInAddedMessage(to: string, provider: string): Message {
  return {
    to,
    subject: 'A new way to sign in to Zenbu Japanese',
    text: [
      `${ways[provider] ?? provider} can now sign in to your Zenbu Japanese account.`,
      '',
      "If you added it, there's nothing to do. If you didn't, sign in, remove it, and reply to this email so we can help.",
      ...signature
    ].join('\n')
  }
}

export function signInRemovedMessage(to: string, provider: string): Message {
  return {
    to,
    subject: 'A way to sign in to Zenbu Japanese was removed',
    text: [
      `${ways[provider] ?? provider} no longer signs in to your Zenbu Japanese account.`,
      '',
      "If you removed it, there's nothing to do. If you didn't, sign in, check how you sign in, and reply to this email so we can help.",
      ...signature
    ].join('\n')
  }
}
