# Signing the Chrome extension in

`/account/extension/` (The Chrome extension) signs Zenbu Japanese for Chrome in to the Zenbu
account the learner is signed in to on the website, in one click (#1130). The extension opens it
from its own sign-in, which reaches `main` with the extension itself (#1070); the service's side
and the message are in
[`account-extension.md`](../../../../docs/agents/account-extension.md), From the website, and the
decision in [ADR 0023](../../../../docs/adr/0023-hand-the-websites-sign-in-to-the-browser-extension-with-a-one-time-code.md).

Abbreviations: paths are under `apps/web/`. **Page tests** are
`src/components/account/extension-sign-in.interaction.test.tsx`, which click through the page in
a DOM with stand-ins for the account service and the extension. **Handover tests** are
`src/lib/account/extension.test.ts`. **Extension spec** is `e2e/extension-sign-in.spec.ts`, the
browser tests at a desktop and a phone width, with the same stand-ins in the browser.

## The page

**An account page.** It is one of the account pages ([Account pages](account.md), Pages): the
site's header and footer, `noindex, nofollow`, in no sitemap, never cached, in English and under
`/ja/`, and closed where the environment names no account service. Its intro says signing out of
either leaves the other signed in.

- Source: #1130, decision D5.
- Check: Account spec, "/account/extension/ is noindex, with the site's header and footer" and "no
  sitemap lists them"; `src/app/[locale]/account-pages.test.tsx`, "/account/extension/ says
  signing in isn't available, and links no account page, without an account service";
  `src/app/routes.test.ts`.

**Signed out, it signs in first.** The page says to sign in here first, then offers every way the
site has (Email me a code, and Apple and Google where it has them set up), and comes back to itself
after Google. Signed in, it shows the click.

- Source: #1130, decision D5.
- Check: Page tests, "signed out, signs in here first, then offers the click"; Extension spec,
  "signed out, signs in here first".

## The click

**Signed in, one click.** The page says who is signed in and offers **Sign in to the extension**.
The click asks the account service for a one-time code with the website's session
(`POST /v1/auth/extension-code`, with the browser's cookie) and hands it to the extension alone:
`chrome.runtime.sendMessage` to the extension's ID, `{ type: 'sign-in', code }`. The extension
answers, and the page says so: signed in (the tab can close), signed in already (sign out in the
extension first to use another account there), too many tries, or try again. The code is never
shown, put in the address, stored, or logged; it expires in five minutes and works once.

- Source: #1130, decision D5.
- Check: Page tests, "signed in, shows the account and hands the extension a code in one click"
  and "says what the extension answered: %s"; Handover tests, "asks for a code with the website's
  session and hands it to the extension alone" and "reads the extension's answer, and takes
  anything else as Try again"; Extension spec, "signed in, one click signs the extension in to the
  same account".

**Without the extension.** In a browser that can't message an extension (not Chrome, or Chrome
without it), the click asks for no code and says the page works in Chrome with Zenbu Japanese for
Chrome installed and up to date. An extension that doesn't answer is taken the same way.

- Source: #1130.
- Check: Page tests, "asks for no code in a browser without the extension, and says where it
  works"; Handover tests, "asks for no code where no extension can be messaged" and "takes a
  missing extension, or one that throws, as no extension"; Extension spec, "without the
  extension, says where it works and asks for no code".

**A session that ended.** When the service refuses the code because the website's session ended,
the page goes back to signing in and messages no extension. When the service can't be reached,
it offers Try again, as the account page does.

- Source: #1130.
- Check: Page tests, "goes back to signing in when the session ended before the click" and "offers
  Try again when the service cannot be reached"; Handover tests, "passes on the service's refusal,
  and messages no extension".
