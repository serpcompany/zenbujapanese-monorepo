import type { Language } from '../language'
import { type Letter, signed } from './letter'
import type { Message } from './mailbox'

interface Notices {
  ways: Record<string, string>
  added(way: string): Letter
  removed(way: string): Letter
  deleted: Letter
}

const notices: Record<Language, Notices> = {
  en: {
    ways: {
      apple: 'Sign in with Apple',
      google: 'Sign in with Google',
      email: 'A code sent to this email'
    },
    added: way => ({
      subject: 'A new way to sign in to Zenbu Japanese',
      paragraphs: [
        `${way} can now sign in to your Zenbu Japanese account.`,
        "If you added it, there's nothing to do. If you didn't, sign in, remove it, and reply to this email so we can help."
      ]
    }),
    removed: way => ({
      subject: 'A way to sign in to Zenbu Japanese was removed',
      paragraphs: [
        `${way} no longer signs in to your Zenbu Japanese account.`,
        "If you removed it, there's nothing to do. If you didn't, sign in, check how you sign in, and reply to this email so we can help."
      ]
    }),
    deleted: {
      subject: 'Your Zenbu Japanese account was deleted',
      paragraphs: [
        'Your Zenbu Japanese account is deleted, with everything it kept in step between your apps.',
        'Each app keeps what is on its device and works signed out. Backups that still hold the account are deleted within 30 days.',
        "If you didn't delete it, reply to this email so we can help."
      ]
    }
  },
  ja: {
    ways: {
      apple: 'Appleでサインイン',
      google: 'Googleでログイン',
      email: 'このメールアドレスに届くコード'
    },
    added: way => ({
      subject: 'Zenbu Japaneseに新しいログイン方法が追加されました',
      paragraphs: [
        `Zenbuアカウントに、ログイン方法「${way}」が追加されました。`,
        'ご自身で追加した場合は、何もする必要はありません。追加した覚えがない場合は、ログインしてこの方法を削除し、このメールにご返信ください。サポートいたします。'
      ]
    }),
    removed: way => ({
      subject: 'Zenbu Japaneseのログイン方法が削除されました',
      paragraphs: [
        `「${way}」では、Zenbuアカウントにログインできなくなりました。`,
        'ご自身で削除した場合は、何もする必要はありません。削除した覚えがない場合は、ログインしてログイン方法を確認し、このメールにご返信ください。サポートいたします。'
      ]
    }),
    deleted: {
      subject: 'Zenbuアカウントが削除されました',
      paragraphs: [
        'Zenbuアカウントと、アプリ間で同期していたすべてのデータを削除しました。',
        '各アプリの端末内のデータはそのまま残り、ログインしなくても使えます。このアカウントがまだ含まれているバックアップは、30日以内に削除されます。',
        '削除した覚えがない場合は、このメールにご返信ください。サポートいたします。'
      ]
    }
  }
}

const wayIn = (provider: string, language: Language) => notices[language].ways[provider] ?? provider

export function signInAddedMessage(to: string, provider: string, language: Language): Message {
  return signed(to, notices[language].added(wayIn(provider, language)))
}

export function signInRemovedMessage(to: string, provider: string, language: Language): Message {
  return signed(to, notices[language].removed(wayIn(provider, language)))
}

export function accountDeletedMessage(to: string, language: Language): Message {
  return signed(to, notices[language].deleted)
}
