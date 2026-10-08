# Account pages

zenbujapanese.com's account pages let a learner make, sign in to, see, change, and delete their
Zenbu account (#468), against the account service ([`account-api.md`](../../../../docs/agents/account-api.md)).
Signing in is passwordless: a code we email, and Apple and Google where the site has them set up
(`ACCOUNT_APPLE_SERVICES_ID` and `ACCOUNT_GOOGLE_SIGN_IN`; staging has both, production neither
yet). The pages are open only where the
environment names an account service: locally and on staging, not yet in production
(Configuration, below). The pages call the service from
the learner's browser, never from the Worker ([`web.md`](../../../../docs/agents/web.md), Account
pages). The website doesn't sync known words or lists yet, and the word page's learner actions
still open the get-the-app prompt ([Dictionary](dictionary.md#word-page), Toolbar, and Lists and
Notes), since signing in on the web doesn't make them work yet.

Abbreviations: paths are under `apps/web/`. **Ways tests** are
`src/components/account/sign-in-ways.interaction.test.tsx`. **Account spec** is
`e2e/account.spec.ts`, the
browser tests at a desktop and a phone width, with a stand-in for the account service in the
browser. **Account service spec** is `e2e/account-service.spec.ts`, which drives a learner
through the pages against a real account service on its dev mailbox (`ZENBU_ACCOUNT_API=1`).
**Closed spec** is `e2e/account-closed.spec.ts`, which runs on the site built and served with
production's settings (`E2E_SITE_ENV=production`).
**Sign-in form tests** and **account page tests** are
`src/components/account/sign-in-form.interaction.test.tsx` and
`src/components/account/account-view.interaction.test.tsx`, which click through the components
in a DOM with a stand-in for the service.

## Pages

**Four pages.** `/login/` (Sign in), `/register/` (Create your account), `/forgot-password/` (No
password needed), and `/account/` (Your account), each with the site's header and footer. Each is
`noindex, nofollow`, and no sitemap lists them: not `/sitemaps/pages.xml`, and not `/sitemap/`.
Their descriptions don't name Apple or Google, which a site offers only once they're set up.
Without an account service (an empty `ACCOUNT_API_URL`, as in production today), each says signing
in to a Zenbu account isn't available on this site yet, without the page's intro, links to no
other account page, and asks the account service nothing.

- Source: #468, whose #402 sitemap sheet lists the four pages. Closed in production because its
  account service doesn't run yet ([`account-api.md`](../../../../docs/agents/account-api.md), Set
  up the server), and a sign-in that can't work shouldn't show.
- Check: Account spec, "/login/ is noindex, with the site's header and footer" (and each other
  page), "no sitemap lists them"; `src/app/account-pages.test.tsx`, "/login/ says signing in isn't
  available, and links no account page, without an account service" (and each other page) and
  "offer signing in, and lead to each other, with an account service"; Closed spec, "/login/
  says signing in isn't available, links no account page, and stays noindex" (and each other
  page); `src/lib/account/pages.test.ts` (the descriptions included); `src/app/routes.test.ts`.

**Log in and the footer.** Where the account pages are open, the header's Log in (in the phone
menu below 1024 pixels) opens `/login/`, and the footer's Products group ends with Sign in, which
leads there too. Both take their address from the `login` entry in `linkTargets`
(`src/lib/site.ts`), which the build points at `/login/` only where the pages are open
(`ZENBU_ACCOUNT_PAGES`, [`web.md`](../../../../docs/agents/web.md), Account pages). Where they're
closed, as in production today, Log in stays a `#` placeholder
([Dictionary](dictionary.md#header-footer-and-site-wide), Placeholder links) and the footer has
no Sign in, so nothing links to the account pages. In a browser that signed in on the site, the
footer says Account and leads to `/account/`; the header's Log in doesn't change. The browser
remembers that
in local storage (`zenbu-signed-in`), which the pages set on signing in and clear on signing out,
on deleting the account, and when the account page finds no session. The server draws Sign in, so
the page and its first render in the browser agree.

- Source: #468, so the pages can be reached; the header's Log in, a placeholder until the login
  page existed (#648, #650), keeps its place and wording.
- Check: `src/lib/site.test.ts`, "Log in opens /login/ in a build whose account pages are open,
  and isn't a placeholder" and "Log in stays a # placeholder in a build whose account pages are
  closed"; `src/components/site-footer.test.tsx`, "the footer groups its links under Products,
  Tools, Company, and Legal", "the footer leads to signing in, as the server draws it before the
  browser knows", and "the footer leaves signing in out where the site's account pages are
  closed"; Account spec, "the header's Log in, or the drawer's on phones, opens the login page"
  and "the footer leads to signing in, and to the account once signed in"; Closed spec, "the
  header's Log in, and the drawer's on phones, stays a # placeholder" and "a page built ahead of
  time has no Sign in in its footer".

## Signing in

**Sign in and Create your account.** Both pages offer the same ways: "Email me a code", and Sign
in (or Sign up) with Apple and with Google where the site has them set up (Sign in with Apple and
Sign in with Google, below). A new email gets a code that makes an account; an
email that has one signs in to it. Create your account says so, and links to Sign in and the
Privacy Policy; Sign in links to Create an account; both link "Can't sign in?" to
`/forgot-password/`, since there's no password to forget. Signed in, the
learner goes to `/account/`. A browser that already signed in sees "You're signed in. Go to your
account." above the ways.

- Source: #477 and ADR 0013 (Apple, Google, and an emailed code, through the account service);
  #468 (the #402 sitemap sheet lists `/register/`), here the same flow, worded for making an
  account.
- Check: Sign-in form tests, "emails a code, signs in with it, and goes to the account page" and
  "tells a browser that already signed in where its account is";
  `src/app/account-pages.test.tsx`, "offer signing in, and lead to each other, with an account
  service" (the links, "Can't sign in?" and the Privacy Policy included); Account spec, "Sign
  in's \"Can't sign in?\" leads to signing in by email code"; Account service spec, which
  registers from `/register/`.

**The email code.** The learner enters their email, then the 6-digit code ("It works for 10
minutes"), with "Send a new code" and "Use another email". A refusal says what to do:

- a wrong code, an expired one, and too many wrong ones;
- an email whose account signs in with Apple or Google: sign in that way, then add the email.
  The service doesn't say which, so where the site offers only one, it says to sign in with that
  one if it's the one, and that the site doesn't offer the other yet; where it offers neither,
  that it doesn't offer them yet, so the learner can't sign in to it here for now;
- no email sender on the service: try again later;
- `429`: how many seconds or minutes the service's `Retry-After` (or Better Auth's
  `X-Retry-After`) names, or a few minutes when it names none.

- Source: the client guide ([`account-clients.md`](../../../../docs/agents/account-clients.md),
  Signing in); `src/lib/account/messages.ts`.
- Check: Sign-in form tests, "says why a code was refused, and how long to wait after too many"
  and "sends an Apple or Google account to sign in that way, here only where the site offers it";
  `src/lib/account/messages.test.ts`, "sends an Apple or Google account to sign in only a way this
  site offers", and its other tests; `src/lib/account/client.test.ts`, "reads how long to wait
  from Retry-After, or Better Auth's X-Retry-After".

**No password needed.** `/forgot-password/` says Zenbu accounts have no password, so there's
nothing to reset, and offers the email code. Where the site offers Apple or Google, it links to
Sign in for an account made that way, naming only the ones it offers ("Made your account with
Apple?"); where it offers neither, it has no such line.

- Source: #468 (the #402 sitemap sheet lists `/forgot-password/`); accounts have no password
  (ADR 0013).
- Check: `src/app/account-pages.test.tsx`, "/forgot-password/ points to Sign in only for the
  ways the site offers, naming them" (neither, Apple, Google, and both); Account service spec,
  which signs in again from `/forgot-password/`.

**Sign in with Apple.** Offered where the Worker names a Services ID (`ACCOUNT_APPLE_SERVICES_ID`).
The page loads Apple's Sign in with Apple JS when the learner points at, focuses, or touches the
button, and asks the service for a nonce then, so the click opens Apple's popup at once. It gets
the next nonce right after each popup, and, when the one it holds is nine minutes old or couldn't
be fetched, a new one at the next point, focus, touch, or click. It
passes Apple the nonce's SHA-256 and the return URL `<site>/account/`, which Apple needs on the
page's own origin for a popup. It signs in with Apple's ID token and the nonce, and, on a first
sign-in, the name Apple hands the page. A closed popup says nothing; a blocked one says to allow
pop-ups; a nonce the service no longer knows says to try again.

- Source: ADR 0013; the popup is how the page gets Apple's code for deleting an Apple account
  ([`web.md`](../../../../docs/agents/web.md), Account pages).
- Check: `src/lib/account/apple.test.ts`; Sign-in form tests, "signs in with Apple's popup, passing
  the first sign-in's name"; Account page tests, "won't confirm with another Apple ID, and asks
  again when Apple refuses the code" (the next nonce, ready before the next click); Ways tests,
  "gets Apple ready when the learner tabs to Add Apple, before the click". Apple itself: not run;
  it takes no `localhost` return URL.

**Sign in with Google.** Offered where `ACCOUNT_GOOGLE_SIGN_IN` is `on`. The page asks the service
to start Google's sign-in and sends the browser to the page it names (only an `https` one). Google
comes back to the service, which sets the session and sends the browser on to `/account/`, or, on
a failure, back to the page it started on with `?error=`, which the page names: an email that has
an account another way, an unverified email, an account another Zenbu account uses, or a cancel.
Back from Google with the browser's Back button, the buttons work again.

- Source: ADR 0013; Better Auth's web sign-in.
- Check: Sign-in form tests, "sends the browser to Google, to come back to the account page, or
  here on a failure" and "says what went wrong when Google's sign-in comes back with an error".
  Google itself: not run.

## Your account

**Signed in, out, or unreachable.** `/account/`'s intro says "See your profile and how you sign
in, change your profile, or delete your account.", which holds for every account, including one
whose only way is the emailed code on a site that offers nothing else, whose ways can't change. It
asks the service for the session in its cookie,
then reads the profile with an access token and the ways to sign in. Signed in, it says "Signed in
as" the email. With no session, it says "You're not signed in." and links Sign in and Create an
account. When the service can't answer, it says so, with Try again.

- Source: the client guide (Access tokens).
- Check: Account page tests, "shows who is signed in, the profile, and the ways to sign in, reading
  /v1/me with an access token only", "shows signed out, and forgets it was signed in, when there is
  no session", "says it could not reach the account service, and tries again when asked"; Account
  spec, "the account page says it can't reach it, and offers to try again";
  `src/app/account-pages.test.tsx`, "offer signing in, and lead to each other, with an account
  service" (the intro).

**Access tokens.** The page keeps its 15-minute access token in memory only, renews it a minute
before it expires, and on a `401` gets one new token and asks again. It takes a token only for the
account it shows: one for another account, as after signing in elsewhere in another tab, shows
signed out, and when the page comes to show another account, it drops the token it held. When the
service refuses a new token (`401`, `unauthorized` or `sign_in_again`), the page shows signed out;
another `401`, such as a refused Apple token, says what went wrong and keeps the learner signed
in. The signed session token stays in its HttpOnly cookie, on the account
service's host: the page never holds it. The session's bare token, which `get-session` shows and
which signs nothing in, only names the session to sign out after a fresh sign-in.

- Source: the client guide (Access tokens).
- Check: `src/lib/account/access-tokens.test.ts`, with "drops the token it holds when the page
  shows another account"; `src/lib/account/messages.test.ts`, "takes a 401
  as signed out only when it says the session is gone, not for a refused token or nonce"; Account
  page tests, "gets a new access token once when /v1/me answers 401";
  `src/lib/account/load.test.ts`.

**Profile.** Name and Username, with Save, and "Member since" the day the account was made. The
username's hint gives the service's rule: "3 to 30 letters a to z, digits, or underscores". Save
sends only what changed, with the profile's version; an empty username removes it. When the
profile changed in another app first, the form shows it as it is now and says so; a taken username
says to try another; another refusal shows the service's reason. When the page reads a newer
profile, as after changing how the learner signs in, the form shows it; an older one of the same
account never replaces it, and another account's always does.

- Source: `PATCH /v1/me` ([`account-api.md`](../../../../docs/agents/account-api.md), Profiles and
  sync).
- Check: Account page tests, "shows who is signed in, the profile, and the ways to sign in,
  reading /v1/me with an access token only" (the hint), "shows the profile as it is now when a
  change conflicts with one made elsewhere", and "shows a newer profile the page reads, as after removing a way to sign in";
  Account service spec, which saves a name and username and reloads them.

**Ways to sign in.** Each way the account signs in: Apple, Google, or "A code we email you" with
its email. Each has Remove while there's more than one, which asks first ("Stop signing in with
…? We'll email you that it was removed."). Add Apple, Add Google, and Add an email code appear for
the ways the account lacks, where the site offers them; an email code adds the account's own
email. Changing a way needs a sign-in from the last 10 minutes, so the page asks the learner to
confirm it's you first when theirs is older, or when the service says so. Before it removes a way,
or adds Apple or Google, the page checks the browser is still signed in to the account it shows:
signed in elsewhere since, as in another tab, it changes nothing and shows the account now signed
in, and when it can't tell, it says so and changes nothing. An email code adds only the shown
account's own email. If the sign-in grows old while the code is on its way, by the page's clock or
because the service refuses the code as from another account's way in, the page asks to confirm
it's you; the code typed is dropped, and a new one is sent after.

- Source: the client guide (Signing in); `POST /v1/auth/link-social` and `unlink-account`.
- Check: Ways tests, "removes a way to sign in after asking, and after a fresh sign-in when the
  last is old", "adds Google by sending the browser to Google, to come back to the account page",
  "adds the account's own email as a way to sign in, with a code", "adds Apple with its popup, and
  stays signed in when Apple is refused on the way", "changes nothing, and shows the account now
  signed in, when another tab signed in elsewhere", and "says so, and changes nothing, when it
  can't tell which account the browser is in", "asks to confirm first when the sign-in grows old
  while the email code is on its way", and "asks to confirm when the service finds the sign-in too
  old for the email code"; `src/lib/account/flows.test.ts`, "tells whether the
  browser is still signed in to the account on the page".

**Confirm it's you.** A fresh sign-in, with the ways the account has: Apple, Google, or a code to
the account's own email. Where the site offers none of them, it says it can't confirm it's you, so
it can't make the change here yet. Apple must be the Apple ID the account uses: another is refused before
it signs in. Confirming, or adding an email code, which signs in again too, signs this browser's
earlier session out, and the page takes a new access token, which carries the new sign-in. The
page then counts itself fresh for nine minutes by its own clock, whatever the browser's clock says
of the service's. Cancel while a confirmation is still finishing stops what it was for: nothing is
deleted, removed, or added, and the browser doesn't leave for Google. A confirmation that lands the
browser in another account goes on with nothing. Google's confirmation leaves the page and comes
back to it; the page remembers the account it left from (in session storage) and, back on the same
account with a new session, signs the earlier session out and counts as confirmed; back with the
same session, as after Google failed, it counts as nothing. If the Google account the learner
chose signs in to another Zenbu account, the page says the browser is now signed in to that one,
and changes nothing else; if it had no Zenbu account, Google's sign-in makes one, as it does on
Sign in, and the page says so plainly: to use their own account, the learner signs out and in
again, and Delete account removes the new one. Coming back with
the browser's Back button forgets it; a page that can't load the account keeps it for Try again.

- Source: the client guide (Deleting the account: a sign-in from the last 10 minutes).
- Check: Account page tests, "deletes after the learner confirms and, with a sign-in over nine
  minutes old, signs in again by code", "won't confirm with another Apple ID, and asks again when
  Apple refuses the code", "after confirming with Google, signs the earlier session out, or says
  when Google's account is another's", "says plainly when confirming with Google made a new
  account", "counts no confirmation when Google's sign-in didn't happen,
  as back from a failed one", "deletes nothing when the learner cancels while confirming is still
  finishing", "goes on with nothing when confirming lands the browser in another account", "says
  it can't confirm an account whose ways this site offers none of", and
  "closes Delete when confirming lands the browser in another account"; Ways
  tests, "adds the account's own email as a way to sign in,
  with a code", "adds Apple after confirming, whatever the browser clock says of the new sign-in",
  "confirming with Google remembers the account it leaves from, and forgets it back without
  signing in", and "stays on the page when the learner cancels while Google's sign-in is starting";
  `src/lib/account/flows.test.ts`.

**Sign out.** Signs this browser out; the learner's other devices stay signed in. When the service
can't sign it out, the page says so and stays signed in.

- Check: Account page tests, "signs out of this browser" and "keeps the learner signed in, and says
  so, when signing out fails"; Account service spec.

**Delete your account.** Says what deleting removes and that each device keeps its data. Delete
account asks "Delete <email> and everything it synced?", with Delete my account and Keep my
account. Deleting then needs, as the client guide says:

- a sign-in from the last nine minutes, by the page's clock, or Confirm it's you first; and again
  if the service answers `403 sign_in_again`;
- for an account that signs in with Apple, Apple's popup, whose fresh sign-in and authorization
  code the page sends with the return URL its popup named. The service revokes the website's Apple
  access with them. Apple refusing the code (`apple_authorization_invalid`), another Apple ID
  (`apple_account_mismatch`), or Apple not answering (`apple_unavailable`) deletes nothing and
  offers Apple again. Where the site offers no Apple, it says to delete the account in the Zenbu
  Japanese app or Tomodachi, where the learner signs in with Apple.

Deleted, the page says the account is gone from every Zenbu app and each device keeps its own
data, signs the browser out, and the footer says Sign in again.

- Source: #574; the client guide (Deleting the account).
- Check: `src/lib/account/flows.test.ts`, "signs the browser out once deleted, and sorts each
  refusal for the page"; Account page tests, "deletes after the learner confirms and, with a
  sign-in over nine minutes old, signs in again by code", "asks for a fresh sign-in when the service answers
  sign_in_again, though the page thought it fresh", "deletes an Apple account with Apple's code,
  after Apple signs it in again with the same Apple ID", "won't confirm with another Apple ID,
  and asks again when Apple refuses the code", and "says where to delete an Apple account when
  this site offers no Apple"; Account service spec.

## Configuration

**Each environment's account service.** The Worker's `ACCOUNT_API_URL` names it:
`https://api-staging.zenbujapanese.com` on staging, `http://localhost:8789` locally, and none yet
in production, whose value is empty until its account service answers on `api.zenbujapanese.com`.
An empty value closes the account pages; one that isn't an origin closes them too and logs
`account_service_url_invalid`. The footer's Sign in and the header's Log in get their address
when the site is built, from the same value in `apps/web/wrangler.jsonc` for the environment being
built, held to the same rule (an origin), so they and the pages agree in a build made as its
environment deploys, with its `SITE_ENV`. A build without `SITE_ENV` draws the local site's header
and footer, whichever Worker vars it then runs with. Opening production is in
[`web.md`](../../../../docs/agents/web.md), Account pages.

- Source: production's account service doesn't run yet
  ([`account-api.md`](../../../../docs/agents/account-api.md), Set up the server).
- Check: `src/lib/account/settings.test.ts`, "name staging's account service, and none yet for
  production, so its pages stay closed" and "close the footer, as the pages, for a value that is
  no origin"; the `Web` workflow's check that staging's build links Log in and Sign in, and its run of the
  Closed spec on a build made as production deploys ([`ci.md`](../../../../docs/agents/ci.md),
  Web).

**Apple and Google in each environment.** Staging offers both: its Worker names the Services ID
`com.zenbujapanese.web` and turns Google on, since staging's account service has Apple's key and
Google's web client. Production offers neither until its account pages open, and the local site
neither, since Apple takes no `localhost` return URL and Google's web client returns only to the
deployed services.

- Source: the account service's staging settings
  ([`account-api.md`](../../../../docs/agents/account-api.md), Set up the server).
- Check: `src/lib/account/settings.test.ts`, "offer Apple and Google on staging, and neither in
  production nor locally".
