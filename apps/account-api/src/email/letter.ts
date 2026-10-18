import type { Message } from './mailbox'

export interface Letter {
  subject: string
  paragraphs: string[]
}

const signature = ['Zenbu Japanese', 'support@zenbujapanese.com'].join('\n')

export function signed(to: string, { subject, paragraphs }: Letter): Message {
  return { to, subject, text: [...paragraphs, signature].join('\n\n') }
}
