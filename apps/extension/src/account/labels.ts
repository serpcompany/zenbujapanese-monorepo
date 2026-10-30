import type { Refusal } from '../shared/account'

export const accountLabels = {
  signedOut: {
    title: 'Not signed in',
    description: 'A Zenbu account keeps your known words, lists and notes on all your devices.'
  },
  email: 'Email',
  sendCode: 'Send Code',
  sent: 'We sent a 6-digit code to',
  sentFor: 'It works for 10 minutes.',
  code: 'Code',
  signIn: 'Sign In',
  sendAgain: 'Send a New Code',
  anotherEmail: 'Use Another Email',
  or: 'or',
  website: 'Continue with zenbujapanese.com',
  google: 'Continue with Google',
  apple: 'Continue with Apple',
  refusals: {
    'wrong-code': "That code isn't right. Check it, or send a new one.",
    'new-code': 'That code has run out or was tried too often. Send a new one.',
    'other-way': "This email's account signs in with Apple or Google. Sign in that way.",
    'has-other-way':
      'This email already has an account that signs in another way, such as an emailed code. Sign in that way.',
    'no-email': "Codes can't be emailed right now. Sign in another way.",
    wait: 'Too many tries. Wait a moment, then try again.',
    cancelled: 'Signing in was cancelled.',
    'other-account': 'That sign-in is to another account. Sign in to this account to delete it.',
    'apple-again': "Apple didn't accept that. Continue with Apple again.",
    'sign-in-again': 'Sign in again to go on.',
    cannot: "That way of signing in doesn't work here yet. Use another way.",
    'try-again': "That didn't work. Try again."
  } satisfies Record<Refusal, string>,
  unsynced: (count: number, owner: string) =>
    count === 1
      ? `1 change in this browser isn't synced to ${owner} yet. Sign in to that account to keep it: signing in to another account removes it.`
      : `${count} changes in this browser aren't synced to ${owner} yet. Sign in to that account to keep them: signing in to another account removes them.`,
  waitFor: (seconds: number) => `Too many tries. Try again in ${seconds} seconds.`,
  subscription: {
    heading: 'Subscription',
    notChecked: 'Not checked yet',
    none: 'No subscription',
    renews: (date: string) => `Subscribed, renews ${date}`,
    ends: (date: string) => `Subscribed, ends ${date}`,
    subscribed: 'Subscribed',
    appStore:
      "Managed in the App Store: change or cancel it in your Apple Account's subscriptions.",
    status: {
      grace_period: "Subscribed, but the last payment didn't go through",
      billing_retry: "The last payment didn't go through",
      pending: 'Waiting for your payment',
      paused: 'Paused'
    } as Record<string, string>,
    subscribe: 'Subscribe…',
    manage: 'Manage Subscription'
  },
  manageAccount: 'Manage Account',
  manageAccountDetail: 'Change your name and how you sign in on zenbujapanese.com.',
  signOut: 'Sign Out',
  signOutDetail: 'Sign out of this browser. Your other devices stay signed in.',
  deletion: {
    deleteAccount: 'Delete Account',
    title: 'Delete your account?',
    explained:
      'Deleting your account removes it, its ways to sign in, and everything it synced, from every Zenbu app. This browser keeps its own words and works signed out. This can’t be undone.',
    appStoreContinues:
      'Deleting your account doesn’t cancel your App Store subscription: Apple keeps billing you until you cancel it in your Apple Account’s subscriptions.',
    websiteEnds: 'Deleting your account ends your zenbujapanese.com subscription at once.',
    subscriptionUnknown:
      'Your subscription isn’t checked yet. Deleting your account ends one bought on zenbujapanese.com, but not one bought in the App Store: Apple keeps billing until you cancel it in your Apple Account’s subscriptions.',
    signInAgain: 'Sign in again to delete',
    apple: 'Your account signs in with Apple, so continue with Apple to delete it.',
    keep: 'Keep My Account',
    confirm: 'Delete My Account',
    deleted: 'Your account is deleted.',
    appStoreStillBills:
      'Your App Store subscription goes on until you cancel it in your Apple Account’s subscriptions.'
  }
}
