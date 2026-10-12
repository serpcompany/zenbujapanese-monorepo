---
name: verify-service
description: Check a change to the dictionary service or the account service by running it. Starts the service from this checkout on its own port (apps/dictionary-api on the port tools/checks/ports.mjs hands this checkout, apps/account-api on 8789), waits until /healthz answers, asks for the routes the change touches, and keeps each answer, the service's log, and which process answered under tmp/agent/verify/. Use after changing a route, an answer's shape, configuration, or startup under apps/dictionary-api or apps/account-api, and to reproduce a service bug before fixing it.
---

# Check a service change by running the service

Each service's tests call its routes in the test process. This skill is the look at the running
thing: the service started as `pnpm dev` starts it, asked over HTTP, with the answers kept. What
should keep working stays a test in the service (`pnpm test` in its folder).

One machine runs several checkouts. The script below starts the service from this checkout, and
refuses to run while another process holds the port, so an answer is never another checkout's.

## 1. Find the routes the change touches

The feature map is each service's route table:

- **The dictionary service:** `docs/agents/dictionary-api.md`, Routes, and for the routes apps
  call, `docs/api/dictionary-api.md`.
- **The account service:** `docs/agents/account-api.md`, Routes, and `docs/api/account-api.md`.

A route's row says what it answers, and the API references give each field and error code.

## 2. Run

From the repository root. Name the run, then the service, then each path to ask for. A path
expects 200; `<status>:` before it expects that status instead:

```sh
.claude/skills/verify-service/run.sh word dictionary /v1/words/1546640 "/v1/search/食べる" 404:/v1/words/0
.claude/skills/verify-service/run.sh health account /v1/health /v1/auth/jwks 401:/v1/me
```

The script does each part of a run:

- **Run state.** It makes `tmp/agent/verify/<date>-<name>/` and writes `run.env` there: the run
  folder, the service, and its address.
- **Launch.** It starts the service from this checkout, without the restart-on-change `pnpm dev`
  adds, and with its log in `service.log`. The dictionary service listens on this checkout's
  `dictionary` port (`pnpm ports`, `docs/agents/verification.md`); the account service on 8789,
  which is one per machine. `/healthz` answering 200 is the ready signal, and a service that
  never gets there stops the run and prints the end of its log.
- **Doctor.** `doctor.txt` says which folder the process runs from, its address, the commit, and
  what `/healthz` named. Read it before trusting an answer.
- **Drive.** One `GET` for each path. The dictionary service's routes need its token, so the
  script makes one for the run and sends it; it is in no file the run keeps.
- **Proof.** `requests.txt` lists each path with its status and size, each answer is kept as
  `<number>.body` and `<number>.headers`, and `service.log` holds the service's line for each
  request: its route, status, and time.
- **Cleanup.** It stops the service it started, and nothing else.

Its exit status is 1 when the service didn't start, or when an answer's status isn't the one
expected.

## What each service needs

- **The dictionary service** reads the app's data and Sudachi's dictionary: `git lfs pull` and
  `pnpm sudachi` as in `docs/agents/dictionary-api.md`, What it reads. It needs no `.env` here.
- **The account service** needs a Postgres 18 database and its `.env`
  (`docs/agents/account-api.md`, Run it). Never print `.env`: it holds the secret that signs
  sessions. With `ACCOUNT_API_EMAIL=dev-mailbox`, the codes it would email are at `/dev/mail`.

## Beyond a `GET`

For another method, or a route that needs a signed-in learner, start the service yourself in the
background (`pnpm dev` in its folder), call it with `curl`, keep what it answers in the run's
folder, and stop its whole process tree when done.

The account service's sign-in paths have a browser test that drives them through the website:
registering with an emailed code, editing the profile, signing out, signing in, and deleting the
account. Start the account service with `ACCOUNT_API_TRUSTED_ORIGINS` set to this checkout's `e2e`
address, then, in `apps/web`:

```sh
ZENBU_ACCOUNT_API=1 pnpm test:e2e e2e/account-service.spec.ts --project desktop
```

A run sends three codes, and the service sends five to one address in 10 minutes
(`docs/agents/web.md`, Account pages).

## What a local run can't show

- **The image.** The `Dictionary API deploy` and `Account API deploy` workflows build it on every
  pull request that changes the service, start it, and call it (`docs/agents/ci-deploys.md`).
- **The API host.** nginx's routing between the two services, and staging, are the server's
  (`docs/agents/api-servers.md`).

## Report

Say which service and paths you asked for, each status, what the answer showed for the behavior
you changed, and the run folder. A check that wasn't run is reported as not run, not as passed.
Git ignores `tmp/agent/verify/`, and housekeeping keeps it.
