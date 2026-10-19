# Account emails

The account service (`apps/account-api`, [`account-api.md`](account-api.md)) emails a learner four
things: a sign-in code, a notice when a way to sign in is added, one when a way is removed, and one
when the account is deleted. This is how it sends them, and in which language.

## Sending

The codes are sent as SERP's
[transactional email standard](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/transactional-email.md)
says (ADR 0013), by `apps/account-api/src/email/mailer.ts`, the one function that sends:

- **Through useSend's hosted API** (`https://app.usesend.com/api/v1/emails`), as serplists.com
  sends, from `EMAIL_FROM`, with no other `Reply-To`, in staging and production. The owners chose
  it on 2026-10-07: "the plan is updated to use usesend like serplists does"
  ([ADR 0013](../adr/0013-run-accounts-and-sync-in-their-own-service-on-the-api-servers.md),
  Amendment). `ACCOUNT_API_EMAIL=cloudflare` sends through Cloudflare Email Service's REST API
  instead, with nothing else changed; it still works, but isn't used.
- **From the support address only.** `EMAIL_FROM` is refused unless it's
  `support@zenbujapanese.com`, which an API key can't enforce the way a Worker binding does.
- **Staging sends only to its test recipients.** `EMAIL_ALLOWED_RECIPIENTS` names them, and the
  service won't start with a sender and no list; production sets `everyone`.
- **A local run never sends.** With `dev-mailbox`, a message is kept in memory and shown at
  `/dev/mail`, and the service listens on `127.0.0.1` only, so nothing off the machine reaches
  it. The image runs with `NODE_ENV=production`, and refuses to start with `dev-mailbox`.
- **Nothing logs a recipient, a code, or a link**: only "sent", "captured", "skipped", or "failed",
  with the sender and a status or the error's kind.

The service doesn't wait for the email before it answers, so how long it takes doesn't show
whether an email has an account.

## The reader's language

Each email is in English or Japanese (#847). SERP's
[localization standard](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/web-stack/localization.md)
(Strings) says emails use the recipient's language, stored on the user record from the page they
signed up on, because `/api` requests carry no language prefix.
`apps/account-api/src/language.ts` picks it:

1. **The language the request names**, in `Content-Language`: exactly `en` or `ja`. Anything else
   (`fr`, `ja-JP`, `JA`, `ja, en`) names none. `Accept-Language` is never read: browsers and the
   iOS app send their own, whatever page the learner is on.
2. **Otherwise the account's**, `users.language`, which the sign-up that made the account sets
   from its request, and nothing changes after. An account made on a Japanese page gets Japanese
   codes from the iOS app too, which names no language. An account made without one has none.
3. **Otherwise English.**

| Email | The request whose language it's in |
| --- | --- |
| A sign-in code | `POST /v1/auth/email-otp/send-verification-otp`. Without a language, the service looks up the email's account after it answers, so the answer's timing shows nothing new. |
| A way added | `POST /v1/auth/link-social`, or `POST /v1/auth/sign-in/email-otp` sent with a session |
| A way removed | `POST /v1/auth/unlink-account` |
| The account deleted | `DELETE /v1/me` |

An account's language comes from `POST /v1/auth/sign-in/email-otp` or
`POST /v1/auth/sign-in/social`. Google's web sign-in makes the account at
`/v1/auth/callback/google`, which Google's redirect reaches with no language, so the sign-in's
start keeps the language in Better Auth's OAuth state, through `addOAuthServerContext`, which only
the service writes, and the callback reads it there (`apps/account-api/src/auth/languages.ts`).
Linking Google on the website keeps it the same way for its notice.

**The website** sends its page's language on every call (`accountApi(apiUrl, locale)` in
`apps/web/src/lib/account/client.ts`), as the [client guide](account-clients.md#the-website) says,
so its sign-ins, codes, and deletions write in the page's language. For `en` and `ja`,
`Content-Language` is a CORS-safelisted request header, so it needs no entry in
`Access-Control-Allow-Headers`, and the service's CORS allows it without listing it. A value
outside that list's characters would have to be listed there, which the service doesn't do; the
website sends only the two.

**The copy** is in `apps/account-api/src/email/sign-in-code.ts` and
`apps/account-api/src/email/account-notices.ts`, each email in both languages, signed
"Zenbu Japanese" and `support@zenbujapanese.com` by `apps/account-api/src/email/letter.ts`. The
Japanese is polite (です・ます), keeps "Zenbu Japanese" and "Zenbuアカウント" as written, calls
signing in ログイン, names Apple and Google as the website's buttons do (Appleでサインイン,
Googleでログイン), and email as the English email does (このメールアドレスに届くコード). It says what
the English says and nothing more: the code, its 10 minutes, and what to do without having asked
for it. No native speaker has reviewed it yet ([`tech-debt.md`](../tech-debt.md)).

## Check it

`pnpm check` in `apps/account-api` runs these with the rest of the service's tests:

- `apps/account-api/src/language.test.ts`: no language, `en`, `ja`, unknown ones, and
  malformed ones, each with and without an account's.
- `apps/account-api/src/email/letters.test.ts`: the English emails word for word as they were
  before Japanese, and the Japanese ones' facts, names, and です・ます, sentence by sentence, with no
  English left but the names.
- `apps/account-api/src/auth/email-language.test.ts`, on the whole service: codes in each
  language, from the website and without one; an account's language kept from a code, an ID
  token, and Google's web sign-in through its callback, and the later codes in it; and the notices
  of a way added or removed.
- `apps/account-api/src/http/delete-account.test.ts`: the deletion notice in the request's
  language, the account's, or English.
- `apps/account-api/src/email/mailer.test.ts`: the mailer, as Sending says.

Running the service with the dev mailbox shows each email at `/dev/mail`
([`account-api.md`](account-api.md), Run it).
