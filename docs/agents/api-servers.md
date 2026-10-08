# The API servers

Zenbu's Node services run in Docker on serpcompany's server, behind its nginx and Cloudflare:

- the dictionary service ([`dictionary-api.md`](dictionary-api.md));
- the account service ([`account-api.md`](account-api.md)).

Staging and production share the one Linux x86-64 server. Its nginx container, on the
`web_network` Docker network, fronts serpcompany's other sites too. GitHub holds no access to it:
a service's deploy workflow publishes a signed image and moves a tag, and the deployer on the
server does the rest. This doc covers what the services share: the API host, the deployer, and
setting up the server. Each service's doc covers its image, its workflow, and its own setup.

## The API host

Clients reach both services at one host, `api.zenbujapanese.com`, and `api-staging.zenbujapanese.com`
for staging (ADR 0012). nginx sends a request by its path:

- `/v1/auth`, `/v1/me`, `/v1/sync`, and `/v1/health`, and anything under them, to the account
  service;
- every other path to the dictionary service, including `/healthz`.

The list is `accountServicePaths` in `packages/node-service/src/api-host.ts`. Each service's tests
check its routes against it: every account route is on the list, and no dictionary route is, so a
new route that would land on the wrong service fails a test. nginx's sites hold the same list, so
a change to it is made in both, in the nginx repository too. Each environment's site sends the
account paths to the account service's alias and the rest to the dictionary service's, with
nginx's resolver and failover as for every slot (Set up the server, step 4).

The sites are `nginx/api-staging.zenbujapanese.com.conf` and `nginx/api.zenbujapanese.com.conf` in
the nginx repository (serpcompany/nginx, proposed on its branch `add-zenbujapanese-api-host`, which
also adds the account service's slots' network to its `docker-compose.yml`). They're the
dictionary service's sites with a second location. Staging's, which production's repeats with
`api.zenbujapanese.com` and the `-production` aliases:

```nginx
server {
        listen 80;
        listen [::]:80;
        server_name api-staging.zenbujapanese.com;

        return 301 https://api-staging.zenbujapanese.com$request_uri;
}

server {
        listen 443 ssl http2;
        listen [::]:443 ssl http2;
        ssl_certificate /etc/ssl/zenbujapanese_com_cert.pem;
        ssl_certificate_key /etc/ssl/zenbujapanese_com_key.pem;
        ssl_client_certificate /etc/ssl/cloudflare.crt;
        ssl_verify_client on;

        server_name api-staging.zenbujapanese.com;

        resolver 127.0.0.11 valid=5s ipv6=off;
        set $account "zenbujapanese-account-api-staging";
        set $dictionary "zenbujapanese-dictionary-api-staging";

        location ~ ^/v1/(auth|me|sync|health)(/|$) {
                proxy_http_version 1.1;
                proxy_set_header Connection "";
                proxy_set_header Host $host;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_connect_timeout 2s;
                proxy_read_timeout 60s;
                proxy_next_upstream error timeout http_502 http_503;
                proxy_next_upstream_tries 2;
                proxy_pass http://$account:8789;
        }

        location / {
                proxy_http_version 1.1;
                proxy_set_header Connection "";
                proxy_set_header Host $host;
                proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                proxy_set_header X-Real-IP $remote_addr;
                proxy_connect_timeout 2s;
                proxy_read_timeout 60s;
                proxy_next_upstream error timeout http_502 http_503;
                proxy_next_upstream_tries 2;
                proxy_pass http://$dictionary:8788;
        }
}
```

- `ssl_client_certificate` and `ssl_verify_client on` take only Cloudflare's client certificate
  (Authenticated Origin Pulls), so a request that skips Cloudflare gets `400` from nginx, and the
  `CF-Connecting-IP` the account service counts by is always Cloudflare's.
- `resolver … valid=5s` with the alias in a variable makes nginx look the alias up every 5
  seconds, so it finds the new slot after a deploy without a reload, and
  `proxy_next_upstream … http_502 http_503` with two tries sends a request a slot can't answer to
  the other.
- The nginx repository's dictionary sites also keep a `location = /v1/sitemaps/conjugations` that
  doesn't fail over on a `503`; the dictionary service no longer has that route (it answers
  `404`), so the API host's sites leave it out.

The dictionary service also keeps its own host (`dictionary-api.zenbujapanese.com`), which the
website's Worker reads; it can move to the API host by changing `DICTIONARY_API_URL`. The two
services stay apart because neither needs the other's data, and they could move to separate
servers by changing only nginx's sites.

## The deployer

Cron runs [`deploy/deployer.sh`](../../deploy/deployer.sh) as root every 5 minutes. It takes no
input and reads no environment variable, so changing what it does takes root on the server; a
change to the script in this repository reaches the server only when someone installs it there.
For each service it knows, and each environment, it asks the registry which image the
environment's tag names (`docker pull`, which fetches only the tag's manifest unless it names a new
image), and when one changed, deploys it.

What differs by service is in the table at the top of the script:

| | Dictionary service | Account service |
| --- | --- | --- |
| Image | `ghcr.io/serpcompany/zenbujapanese-dictionary-api` | `ghcr.io/serpcompany/zenbujapanese-account-api` |
| Signed by | `.github/workflows/dictionary-api-deploy.yml` on `main` | `.github/workflows/account-api-deploy.yml` on `main` |
| Slots' network | `zenbujapanese-dictionary-api`, internal: a slot reaches nginx and nothing else, since the service parses untrusted input with native code (Sudachi, SQLite) | `zenbujapanese-account-api`, not internal: the service calls Apple, Google, and useSend |
| Private networks | none | `zenbujapanese-account-db`, internal, which holds only Postgres |
| Limits | 4 GB of memory, 4 CPUs, 512 processes | 512 MB of memory, 1 CPU, 256 processes |
| Its release | `DICTIONARY_API_RELEASE`; `/healthz` answers it at the end of `build` | `ACCOUNT_API_RELEASE`; `/healthz` answers it as `release` |

**Each environment runs in one of two slots.** Both answer to the environment's network alias on
the slots' network, such as `zenbujapanese-dictionary-api-staging`. nginx is on every slots'
network too. It resolves the alias every 5 seconds, and sends a request one slot can't answer,
because it's stopped, to the other. The deployer deploys nothing while a slots' network is missing,
isn't as internal as the table says, or doesn't have nginx on it, or while a private network is
missing or isn't internal, since a slot there couldn't serve.

**A deploy swaps slots without dropping a request.**

1. It creates the new image's container in the free slot without the alias, so nginx sends it
   nothing while it starts, connects it to the service's private networks, and only then starts
   it, so the service never starts without its database.
2. It waits until its `/healthz` names the image's release. Each check may take 3 seconds, and the
   whole wait 3 minutes.
3. It gives it the alias, by reconnecting it to the network, since Docker can't add an alias to a
   connected container.
4. It waits 10 seconds more, past nginx's 5-second resolver cache, so nginx has seen it.
5. It stops the old one.

That's about 20 seconds, and nginx is never reloaded. A new image that doesn't come up is removed,
the old one keeps serving, and that image isn't tried again until the tag moves or the
environment's file changes.

**A changed environment file deploys again.** Docker reads an environment's file
(`/etc/zenbujapanese-<service>/<environment>.env`) only when it creates a container. So each slot
carries a label with the file's SHA-256, and when the file changes, the deployer deploys the same
image again, the same way, so the new settings take effect without a request dropped. A slot
started before slots had the label counts as current until its image changes.

**Only main's images run.** Anyone who can push to a package can push an image and move a tag,
including a workflow run from any branch, so the tag alone decides nothing. Each service's deploy
workflow signs the image's digest keylessly with cosign, which records the signature in Sigstore's
public transparency log. The deployer runs an image only when `cosign verify` finds a signature
from that service's workflow on `refs/heads/main`.

**No image can starve the server or change it.** Every container is capped by the table's limits
and 30 MB of logs. It runs as user 1000 (the node image's `node`), whatever the image says, with no
capabilities and a read-only file system. An image that declares a volume is refused, and a removed
container's volumes go with it. The deployer touches only the containers it started, by the ID
Docker gave it, and this repository's images, and never nginx or Postgres.

A few details keep a deploy safe:

- **A lock per service.** Runs take one in `/run`, where only root can create one, since a deploy
  can outlast 5 minutes; a run that finds it taken logs that and skips the service.
- **A folder only root can open.** Each run keeps the registry logins and the IDs of the
  containers it starts there, and removes it when the run ends.
- **Stopped slots first.** A deploy removes the environment's stopped slot containers, freeing
  their slots, and treats any container with a slot's name as taking it.
- **The verified digest.** It runs the new container by its image's digest, the one cosign
  verified.
- **A restart policy only once it answers,** so a crash shows at once rather than as a restart
  loop. The old slot gets SIGTERM and 30 seconds to finish its requests.
- **A deploy cut short is finished.** A run that finds the tag's image in a slot finishes the
  deploy: once it answers as the tag's release, it gets the alias and the restart policy, and the
  other slot stops. One that doesn't answer is removed, unless it has the alias, since it's
  serving.
- **Old images are pruned.** After a deploy, the deployer removes the service's images that no slot
  uses, except the ones the deploy replaced, which a rollback deploys again, and the ones the tags
  name. It removes an image by its references in this repository, so an image another repository
  also names stays. It lists every image rather than filtering them by reference, since
  `--filter reference=` leaves out an image pulled by digest alone.

To look after it:

- **See what runs:** `docker ps --filter label=zenbujapanese.<service>.slot`, such as
  `zenbujapanese.account-api.slot`. **See what the deployer did:**
  `journalctl -t zenbujapanese-<service>`. It logs every run that skips something: a service or
  environment that isn't set up, an image main didn't sign, an image that failed before, and a run
  that found an earlier one still deploying.
- **Retry a failed image.** An image that didn't come up is recorded, with when and why, in
  `/var/lib/zenbujapanese-<service>/failed-<environment>`, and skipped until the tag moves or the
  environment's file changes. When it failed for a reason that wasn't the image's (the server
  restarting Docker mid-deploy, or the account service's database being down while it started),
  delete that file to try it again on the next run.

## Set up the server

A person with root sets these up once. Each service then has its own steps
([`dictionary-api.md`](dictionary-api.md), Set up the server;
[`account-api.md`](account-api.md), Set up the server).

1. **cosign**, which the deployer verifies each image's signature with: the version the workflows
   sign with, checked against its release's SHA-256 (for an arm64 server, `cosign-linux-arm64`
   and `c5d324e091826b0d7a78eb16fef316450b4eb9aaec045611c08ba06f5e73220a`). The server needs
   outbound HTTPS to Sigstore (`tuf-repo-cdn.sigstore.dev`) for its trust root:
   ```sh
   curl -fsSLo cosign https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign-linux-amd64
   echo '4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71  cosign' | sha256sum --check
   sudo install -m 755 cosign /usr/local/bin/cosign && rm cosign
   ```
   Without it, the deployer deploys nothing, and says so.
2. **The deployer**, from `deploy/deployer.sh`, run every 5 minutes and stopped after 25. It needs
   `logger`, `flock`, and `timeout`, which Ubuntu and Debian have. Copy the script from a checkout
   of `main` to the server, such as `scp deploy/deployer.sh <server>:`, then, in that folder:
   ```sh
   sudo install -m 755 deployer.sh /usr/local/bin/zenbujapanese-deployer
   echo '*/5 * * * * root timeout 25m /usr/local/bin/zenbujapanese-deployer >/dev/null 2>&1' |
     sudo tee /etc/cron.d/zenbujapanese-deployer >/dev/null
   sudo chmod 644 /etc/cron.d/zenbujapanese-deployer
   ```
   Reinstall it this way after changing it; nothing else updates it. A service it knows but isn't
   set up on the server (`/etc/zenbujapanese-<service>` is missing) is skipped, with a line in the
   journal.

   **Moving from the dictionary service's own deployer.** The server used to run
   `/usr/local/bin/zenbujapanese-dictionary-api-deployer` from
   `/etc/cron.d/zenbujapanese-dictionary-api`. Install the one above, then remove both. The two
   take the same lock for the dictionary service, so they never deploy it at once, even before
   the old one is gone:
   ```sh
   sudo rm /etc/cron.d/zenbujapanese-dictionary-api /usr/local/bin/zenbujapanese-dictionary-api-deployer
   ```
3. **Registry access.** The first push of each service's image creates its package in the
   serpcompany organization (github.com/orgs/serpcompany/packages), private, as new packages are,
   and the image's `org.opencontainers.image.source` label links it to this repository, whose
   readers may pull it. The deployer pulls it with a GitHub token (classic) with only the
   `read:packages` scope, which it reads from a root-only file in the service's folder on every
   run. Make the token as a GitHub user who can read this repository: Settings → Developer
   settings → Personal access tokens → Tokens (classic) → Generate new token (classic), a note
   such as "zenbujapanese deployer", an expiry with a reminder to replace it, and `read:packages`
   alone; then, if the organization uses SSO, Configure SSO → Authorize for serpcompany. One token
   serves both services; write it to each service's folder:
   ```sh
   service=account-api
   sudo install -d -m 700 /etc/zenbujapanese-$service
   read -rsp 'Token: ' token && echo
   printf 'GHCR_USERNAME=%s\nGHCR_TOKEN=%s\n' <github user> "$token" |
     sudo tee /etc/zenbujapanese-$service/registry.env >/dev/null
   sudo chmod 600 /etc/zenbujapanese-$service/registry.env
   unset token
   ```
   `read -s` takes the token without echoing it, so it stays out of the terminal and the shell's
   history. The deployer logs in for that run only, from the folder only root can open, so no
   login stays on the server. Replace the file to change the token. If the token expires or its
   account loses access, the deployer's journal says it couldn't read the tag from the registry.
   Without the file it pulls without a login, which works once an organization owner makes the
   package public (Package settings → Change visibility). Check the token at once, before any
   environment uses it, by pulling with it alone:
   ```sh
   sudo service="$service" sh -c '. "/etc/zenbujapanese-$service/registry.env" &&
     export DOCKER_CONFIG="$(mktemp -d)" &&
     printf %s "$GHCR_TOKEN" | docker login ghcr.io --username "$GHCR_USERNAME" --password-stdin &&
     docker pull "ghcr.io/serpcompany/zenbujapanese-$service:staging"; rm -rf "$DOCKER_CONFIG"'
   ```
   It worked when the pull finishes. The `:staging` tag exists once the service's deploy workflow
   has run on `main`. Later, a journal line `couldn't read <image>:<environment>
   from the registry` means the token failed, or that the environment's tag doesn't exist yet:
   `:production` exists only once a deploy workflow has run its `production` job, which a run by
   hand does, so until then production's line appears every run and changes nothing.
4. **nginx.** The nginx repository holds each environment's site for each service, with:
   - the `zenbujapanese.com` Cloudflare origin certificate (`nginx_certs/zenbujapanese_com_cert.pem`
     and `_key.pem`) and Cloudflare's client certificate, as the other sites have;
   - the network alias, resolved every 5 seconds;
   - failover to the other slot.

   Adding a site is the one change nginx ever needs: merge it in the nginx repository, `git pull`
   in the repository's clone on the server (the folder that holds its `docker-compose.yml`, whose
   `./nginx/` is the container's `/etc/nginx/conf.d/`), then check and reload nginx, which keeps
   the container and every other site running:
   ```sh
   docker exec nginx nginx -t && docker exec nginx nginx -s reload
   ```
   A new external network in `docker-compose.yml` must exist before the next `docker compose up`,
   so create each slots' network (each service's Set up the server) before pulling the change
   that names it.
   A staging host name has one level (`api-staging.zenbujapanese.com`), since the origin
   certificate covers `*.zenbujapanese.com` alone. Connecting nginx to a service's slots' network
   adds a second network: nginx keeps `web_network` and every other site, and doesn't restart. The
   nginx repository's `docker-compose.yml` lists each slots' network for nginx too (as an external
   network), so a recreated nginx joins them all.
5. **Cloudflare**, in the `zenbujapanese.com` zone:
   - **DNS** (DNS → Records → Add record): for each host name, such as `api` and `api-staging`, a
     record of the same type and content as `dictionary-api`'s, the server's address, with Proxy
     status **Proxied**. A host name already there needs nothing.
   - **Authenticated Origin Pulls** (SSL/TLS → Origin Server → Authenticated Origin Pulls): on,
     since the sites accept only Cloudflare's client certificate. The SSL/TLS mode stays Full
     (strict), which the origin certificate allows.

   It worked when `https://api-staging.zenbujapanese.com/healthz` answers in a browser, and a
   request straight to the server's address, skipping Cloudflare
   (`curl -k --resolve api-staging.zenbujapanese.com:443:<server address> https://api-staging.zenbujapanese.com/healthz`),
   gets nginx's `400 No required SSL certificate was sent`.

   The zone's Bot Fight Mode stays on and can't be skipped per host name. It challenges CI
   runners, so nothing in CI checks a deployed service, and it may challenge the apps' requests
   (ADR 0012).
