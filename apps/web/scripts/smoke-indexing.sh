#!/usr/bin/env bash

check_indexing() {
  local base="$1" env="$2" canonical="$3"
  shift 3
  local indexed=("$@")
  local smoke_header=(-H 'x-zenbu-smoke-test: 1')
  local challenge='www-authenticate: Basic realm="zenbujapanese staging", charset="UTF-8"'

  robots_tag() {
    curl -sI "${smoke_header[@]}" "$base$1" | tr -d '\r' | grep -i '^x-robots-tag:' || true
  }
  robots() { body /robots.txt; }
  head_with() { curl -sI "${smoke_header[@]}" -u "$1" "$base$2" | tr -d '\r'; }
  status_with() {
    curl -s "${smoke_header[@]}" -u "$1" -o /dev/null -w '%{http_code}' "$base$2"
  }

  lists_index() { grep -qxF "Sitemap: $canonical/sitemap-index.xml" <<<"$(robots)"; }
  eventually 'robots.txt lists the sitemap index' 'robots.txt is missing the sitemap index' lists_index

  if [ "$env" = production ]; then
    local path
    for path in "${indexed[@]}"; do
      has_no_robots_tag() { [ -z "$(robots_tag "$path")" ]; }
      eventually "no X-Robots-Tag on $path" "unexpected X-Robots-Tag on $path" has_no_robots_tag
    done
    allows_crawling() { grep -q '^Allow: /$' <<<"$(robots)"; }
    eventually 'robots.txt allows crawling' 'robots.txt does not allow crawling' allows_crawling
    asks_for_no_password() {
      local head
      head="$(head_with staging:wrong /)"
      grep -q '^HTTP/[0-9.]* 200' <<<"$head" && ! grep -qi '^www-authenticate:' <<<"$head"
    }
    eventually 'production asks for no password, even given a wrong one' \
      'production refused a wrong password or sent WWW-Authenticate' asks_for_no_password
    return
  fi

  disallows_crawling() { grep -q '^Disallow: /$' <<<"$(robots)"; }
  eventually 'robots.txt disallows crawling' 'robots.txt allows crawling' disallows_crawling
  audit_crawls() { [[ "$(robots)" == *$'User-Agent: AhrefsSiteAudit\nAllow: /'* ]]; }
  eventually "robots.txt gives AhrefsSiteAudit production's rules" \
    'robots.txt has no AhrefsSiteAudit group that allows crawling' audit_crawls
  sends_noindex() { grep -qi 'noindex' <<<"$(robots_tag /)"; }
  eventually "the smoke test's header passes without the password, with noindex" \
    'missing X-Robots-Tag noindex' sends_noindex

  refuses_a_wrong_password() {
    local head
    head="$(head_with staging:wrong /)"
    grep -q '^HTTP/[0-9.]* 401' <<<"$head" && grep -qixF "$challenge" <<<"$head"
  }
  eventually 'a wrong password gets 401 and the Basic challenge' \
    'a wrong password was not refused with the Basic challenge' refuses_a_wrong_password
  passes_the_password() {
    local head page
    head="$(head_with staging:stagingpassword /)"
    page="$(curl -s "${smoke_header[@]}" -u staging:stagingpassword "$base/")"
    grep -q '^HTTP/[0-9.]* 200' <<<"$head" && ! grep -qi '^x-robots-tag:' <<<"$head" &&
      grep -qF "<link rel=\"canonical\" href=\"$canonical\"/>" <<<"$page"
  }
  eventually "the password gets 200, a canonical on $canonical, and no noindex" \
    'the password was refused, or its page has noindex or another canonical' passes_the_password
  robots_needs_no_password() { [ "$(status_with staging:wrong /robots.txt)" = 200 ]; }
  eventually 'robots.txt answers without the password' 'robots.txt asked for the password' \
    robots_needs_no_password
  association_needs_no_password() {
    local head
    head="$(head_with staging:wrong /.well-known/apple-app-site-association)"
    ! grep -q '^HTTP/[0-9.]* 401' <<<"$head" && grep -qi '^x-robots-tag:.*noindex' <<<"$head"
  }
  eventually 'the Apple association file answers without the password, with noindex' \
    'the Apple association file asked for the password, or has no noindex' \
    association_needs_no_password
  local host_head
  host_head="$(curl -sI "$canonical/" | tr -d '\r')"
  if grep -qi '^cf-mitigated: *challenge' <<<"$host_head" || grep -q '^HTTP/[0-9.]* 403' <<<"$host_head"; then
    echo "skip a request with no password at $canonical gets 401: Bot Fight Mode blocked this machine"
    echo "::warning::Bot Fight Mode blocked this machine at $canonical/, so the check that a request with no password gets 401 there didn't run. Run apps/web/scripts/smoke.sh from a machine it doesn't block to check it."
  else
    refuses_no_password_on_the_host() {
      local head
      head="$(curl -sI "$canonical/" | tr -d '\r')"
      grep -q '^HTTP/[0-9.]* 401' <<<"$head" && grep -qixF "$challenge" <<<"$head"
    }
    eventually "a request with no password at $canonical gets 401 and the Basic challenge" \
      "a request with no password at $canonical wasn't refused" refuses_no_password_on_the_host
  fi
}
