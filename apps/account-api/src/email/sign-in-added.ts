import type { Message } from './mailbox'

const ways: Record<string, string> = {
  apple: 'Sign in with Apple',
  google: 'Sign in with Google',
  email: 'A code sent to this email'
}

export function signInAddedMessage(to: string, provider: string): Message {
  const way = ways[provider] ?? provider
  return {
    to,
    subject: 'A new way to sign in to Zenbu Japanese',
    text: [
      `${way} can now sign in to your Zenbu Japanese account.`,
      '',
      "If you added it, there's nothing to do. If you didn't, sign in, remove it, and reply to this email so we can help.",
      '',
      'Zenbu Japanese',
      'support@zenbujapanese.com'
    ].join('\n')
  }
}
