# Spike for #944: the browser extension and the account service

Throwaway. Never merged. It answers whether an MV3 extension can sign in, sync, read the
subscription, sign out, and delete the account against the account service, with or without CORS,
and what `chrome.identity.launchWebAuthFlow` returns for a fragment redirect and a `form_post`.

- `ext/`: the extension. Its `key` pins its ID to `dejebckgimdjgbclmjicoebbpmbplldh`.
- `db.mjs`: a PGlite Postgres on 127.0.0.1:55433, from `apps/account-api`'s dependencies.
- `idp.mjs`: a stand-in identity provider on 127.0.0.1:3997 (a fragment redirect, a `form_post`,
  and a bridge that turns a `form_post` into a fragment redirect), and a header echo.
- `run.mjs`: drives Chrome for Testing with puppeteer-core (`npm i puppeteer-core@24` in a folder,
  passed as `PUPPETEER_DIR`), with `CHROME` the Chrome for Testing binary and a fresh profile under
  `PROFILE_ROOT`. `DELETE=1` deletes the account before signing out.
- `results/`: runs A to D, as #944's comment describes.

The service runs from `apps/account-api` with `.env`: `DATABASE_URL` from `db.mjs`,
`ACCOUNT_API_URL=http://localhost:8790`, `PORT=8790`, `ACCOUNT_API_EMAIL=dev-mailbox`,
`ACCOUNT_API_TRUSTED_ORIGINS=http://localhost:3999`, and for run C `SPIKE_EXTENSION_IDS` set to
the ID above. Calls send a random `cf-connecting-ip` only so the local rate limit's shared bucket
doesn't refuse them.
