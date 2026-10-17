# The deployer's Slack alerts

The server's deployer ([`api-servers.md`](api-servers.md), The deployer) writes what it does to the
server's journal, which nobody reads until something is already wrong, and CI can't see the server
deploy at all. So the deployer can also post to a Slack channel: each failure once, and each deploy
that goes live. It posts nothing until a person with root gives it a webhook. This doc covers what
it reports, its settings file, turning alerts on, what it remembers, and its tests.

## What it reports

A failure starts `Deploy problem:` and a deploy that went live starts `Deployed:`, then the
service, the environment, and the line the journal has:

```text
Deployed: account-api: staging: ghcr.io/serpcompany/zenbujapanese-account-api@sha256:… as 1a2b3c4d5e6f in slot b
Deploy problem: dictionary-api: production: ghcr.io/serpcompany/zenbujapanese-dictionary-api@sha256:… isn't signed by .github/workflows/dictionary-api-deploy.yml on main; not deploying it
```

**Failures**, each reported once while it lasts:

- **A deploy that fails.** The new image didn't answer `/healthz`, or answered as another release;
  Docker couldn't create or start its container, connect it to a private network, or give it the
  alias; or both slots' names are taken. The message says the running version was kept, and for an
  image that didn't come up, how to try it again.
- **An image it refuses.** Main didn't sign it, it declares volumes, it names no release, it has
  no digest in its repository, or cosign isn't installed.
- **An image it skips because it failed before**, when the failure itself never reached Slack:
  alerts were off then, or Slack didn't take the message.
- **The registry or the network.** The registry didn't hand over an environment's tag,
  `registry.env` is missing a setting, or a slots' network or a private network is missing, isn't
  as internal as it should be, or doesn't have nginx on it.
- **A serving slot that stops answering `/healthz`.** The deployer leaves it as it is.
- **An old slot it can't stop and remove** after a deploy, which serves beside the new one while
  it runs.
- **The deployer's own errors.** A run that stopped before it finished, with how long it ran and
  the command it stopped at: cron stops a run after 25 minutes, and anything sooner is an error in
  the script. A check that failed without a reason the script knows. A service's lock it can't
  open. No working folder, as on a full disk.

**Successes:** each deploy that goes live, with its service, environment, image by digest, the
build its `/healthz` answers, and its slot, and an earlier deploy that a later run finishes: one
cut short, or one whose old slot wouldn't stop.

It doesn't report what isn't a failure: a service or an environment that isn't set up on the
server, and a run that found an earlier one still deploying. Those stay in the journal.

A message holds only words the script writes, with image references, container names, the
server's paths, and the build a slot answers. It never holds an environment file's settings, a
token, the webhook's address, a container's log, or what the registry said: those stay in the
journal, or on the server. The deployer keeps printable ASCII alone, and escapes what Slack and
JSON read as markup, so a build's name can't break a message or mention a channel.

## The settings file

`/etc/zenbujapanese-deployer/alerts.env`, owned by root with mode 600, in a folder only root can
open. The deployer reads it on every run, as it reads `registry.env`: `NAME=value` lines without
quotes, and the last line that sets a name wins. It still takes no input and reads no environment
variable, so changing what it reports takes root on the server.

| Setting | Holds | Without it |
| --- | --- | --- |
| `SLACK_WEBHOOK_URL` | A Slack incoming webhook's address, `https://hooks.slack.com/…`. It is a secret: anyone who has it can post to its channel | Nothing is sent |
| `REPORT_FAILURES` | `on` or `off` | `on` |
| `REPORT_SUCCESSES` | `on` or `off` | `on` |

- **With no file, or no webhook in it,** the deployer sends nothing and deploys as it always has.
- **With a webhook,** it reports failures and successes unless the file turns one `off`. Any other
  value counts as `on`.
- **An address that isn't a Slack webhook's,** such as a bot token, sends nothing, and each run
  says so in `journalctl -t zenbujapanese-deployer`, without the value.

The webhook decides the channel, so one file serves both services.

## Turn alerts on

A person with root on the server does this once.

1. **Make the webhook.** In Slack, create an app for the workspace (api.slack.com/apps → Create
   New App → From scratch), turn on Incoming Webhooks, choose Add New Webhook to Workspace, and
   pick the channel. Copy the webhook's address.
2. **Install this repository's deployer,** since the server runs whichever copy was last
   installed, and one from before the alerts ignores the file
   ([`api-servers.md`](api-servers.md), Set up the server, step 2). From a checkout of `main`,
   `scp deploy/deployer.sh <server>:`, then on the server:
   ```sh
   sudo install -m 755 deployer.sh /usr/local/bin/zenbujapanese-deployer
   ```
   It posts with `curl`, which the server has.
3. **Write the settings file.** `read -s` takes the address without echoing it, so it stays out of
   the terminal and the shell's history:
   ```sh
   sudo install -d -m 700 /etc/zenbujapanese-deployer
   read -rsp 'Webhook: ' webhook && echo
   printf 'SLACK_WEBHOOK_URL=%s\nREPORT_FAILURES=on\nREPORT_SUCCESSES=on\n' "$webhook" |
     sudo tee /etc/zenbujapanese-deployer/alerts.env >/dev/null
   sudo chmod 600 /etc/zenbujapanese-deployer/alerts.env
   unset webhook
   ```
4. **Check the webhook** by posting to it as the deployer does, with the address in curl's
   settings rather than on its command line:
   ```sh
   sudo sh -c '. /etc/zenbujapanese-deployer/alerts.env &&
     printf "url = \"%s\"\n" "$SLACK_WEBHOOK_URL" |
     curl --fail --silent --show-error --config - --header "Content-Type: application/json" \
       --data "{\"text\":\"The deployer can post here\"}"' && echo
   ```
   It worked when Slack answers `ok` and the channel shows the message.

The next run reads the file: there is nothing to restart. That run reports each failure that is
standing then, once. A server whose `:production` tag doesn't exist yet reports that it couldn't
read it from the registry, once, as its journal says on every run
([`api-servers.md`](api-servers.md), Set up the server, step 3). To change a switch or the channel,
edit the file; to stop the alerts, remove it.

## What it remembers

The deployer runs every 5 minutes, so a failure that stands would be posted 288 times a day. It
keeps the condition it last reported for an environment in
`/run/zenbujapanese-<service>.alerted-<environment>`, and says nothing while a run finds that same
condition.

- **It forgets when the environment's check passes:** it deployed, or it runs the tag's image and
  answers. The same failure coming back later is reported again.
- **A different failure replaces it,** and is reported. It holds one condition for each
  environment, so if the first failure then comes back, that is reported again too.
- **A failed image is reported when it fails.** The runs that skip it afterwards say nothing more.
  After `rm /var/lib/zenbujapanese-<service>/failed-<environment>`, a second failure is reported
  again. Where the deployer can't write that record, as on a full disk, it tries the image on
  every run, and still reports it once.
- **A success isn't remembered:** each deploy is one event.
- **To hear of a standing failure again,** delete the file.

`/run/zenbujapanese-<service>.alerted-run` holds a condition that isn't one environment's, such as
`registry.env` missing a setting, and `/run/zenbujapanese-deployer.alerted-run` the deployer's own,
such as no working folder.

The memory is in `/run`, beside each service's lock, and not in `/var/lib` with the failed images'
records, because it has to be writable when things go wrong. A full disk, or one remounted
read-only, is when the deployer fails on every run, and a memory it couldn't write then would post
the same failure every 5 minutes; `/run` is in memory, so it stays writable. The cost is that a
reboot empties it, so a failure still standing after a reboot is reported once more. A run reads
and writes an environment's memory while it holds the service's lock, so two overlapping runs
never both report; only a run that was stopped writes it after letting the lock go.

## A message can't hold up a deploy

- **It is sent after the step it reports:** once the new slot has the alias and the old one has
  stopped, or once a failed container is removed.
- **curl gets 5 seconds and one try,** and `timeout` kills it at 10 in case it overruns, as curl
  can while a name resolves. A run sends at most a message or two for each environment.
- **A run that is stopped frees its service's lock before it reports,** so the run cron starts at
  that moment isn't kept out, and ignores a further signal until it has reported and removed its
  working folder: `timeout` signals the script and then its whole process group.
- **A send that fails is logged, and changes nothing else:**
  `couldn't send an alert to Slack (curl's exit status 28, HTTP status 000)` in the service's
  journal, without the address. The run carries on, and exits as it would have.
- **A failure Slack didn't take isn't remembered,** so the next run sends it again while it
  stands. A success Slack didn't take is in the journal alone.
- **The address never reaches a command line,** where `ps` would show it to every user on the
  server: curl reads it from a pipe.

## Tests

`tools/checks/src/deployer/` runs `deploy/deployer.sh` itself, in a scratch tree that stands in for
the server:

- **A copy of the script, with two things rewritten:** its `PATH`, which becomes the scratch
  tree's `bin` alone, and the server's folders it names (`/etc/zenbujapanese-…`,
  `/var/lib/zenbujapanese-…`, and `/run/zenbujapanese-…`), which move under the tree. The tests
  refuse to run a copy that sets `PATH` more or less than once, or that names any other folder
  under `/etc`, `/var`, `/run`, or `/usr`. Nothing in the production script changes for them.
- **Stand-ins the test answers:** `docker` (images, containers, and networks it keeps in memory,
  answering each command and format the script uses and no other), `cosign`, `curl`, `logger`,
  `id`, `sleep`, and `mktemp`. A command or a format the stand-ins don't know fails the test, so a
  change to how the script calls Docker means teaching them.
- **The system's own tools for the rest,** linked into `bin` by name, so the script can run
  nothing else. On Linux those are the GNU tools the server has, `flock` and `timeout` included. A
  Mac lacks four of them (`flock`, `timeout`, and GNU `base64` and `xargs`), and gets small
  stand-ins for those.

The stand-in for Docker writes its answer a line at a time, where the Docker CLI writes a short
one at once, and the script doesn't depend on either. It reads the whole of an answer it searches
before `grep` looks in it (`lists`, and `digest_reference_of`). Piped straight into
`grep --quiet`, which stops reading at its match, Docker's next write would die of SIGPIPE, and
`pipefail` would fail a check that found its line. A test gives it answers longer than a pipe
holds, with the line it looks for first.

They cover each deploy path, each refusal with its message, the settings file and its switches,
what a message may hold, a send that fails, the memory, and a run cut short or failing in the
script. The script needs bash 4.4 or later, which a Mac doesn't ship (`/bin/bash` is 3.2): there
the tests skip unless a newer `bash` is on `PATH`, and in CI they fail rather than skip. Run them
with `pnpm --filter zenbujapanese-checks test`; `Repository` runs them on every pull request
([`ci.md`](ci.md), Repository).
