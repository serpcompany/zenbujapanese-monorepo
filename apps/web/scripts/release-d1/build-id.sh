#!/usr/bin/env bash
# shellcheck disable=SC2154 # The database's settings come from <database>/database.sh.
# Prints a release database's build ID: a hash of everything that shapes its contents, so a
# change to any of them imports a new database instead of reusing an old one (issue 464).
#   - the database's inputs (<database>/database.sh's build_inputs): its artifact and other data
#     files, its migrations and schema, any other source files, and the code that precomputes its
#     rows;
#   - the import scripts: the shared ones in this directory and the database's own, but not
#     another database's.
# Tests (*.test.ts, *.test.tsx) are left out: changing a gate's test doesn't import a new build,
# but changing anything it runs or draws does, since build_inputs lists those.
#
# It hashes each file's contents under a logical name, not its path (issue 463): the name is the
# file's path under the longest of the database's input_roots that holds it, prefixed with that
# root's name. A file's content hash is its Git blob SHA, or for a Git LFS file, the SHA-256 in
# its pointer (no download needed), except <database>/database.sh's, which is hashed with each
# root's directory written as the root's name. So moving a root's files (git mv) and updating its
# paths in database.sh keeps the ID; editing, adding, removing, or renaming a file within its root
# changes it.
# Every declared input must exist: a missing one fails rather than being left out.
# Reads committed blobs from HEAD, so a checkout builds the same ID everywhere.
#
#   scripts/release-d1/build-id.sh <search|dictionary>
set -euo pipefail
source "$(dirname "$0")/common.sh"
load_database "${1:-}"
[ -n "$(lfs_oid "$source_db")" ] || { echo "$source_db is not a Git LFS pointer at HEAD" >&2; exit 1; }
scripts=apps/web/scripts/release-d1

# Each input's blobs at HEAD, as `<blob SHA> <size> <path>`: the shared scripts (not their
# subdirectories), then every declared input and the database's own scripts, recursively.
blobs=$(git -C "$repo_root" ls-tree -l HEAD -- "$scripts/" | awk '$2 == "blob"')
for input in "${build_inputs[@]}" "$scripts/$database"; do
  listing=$(git -C "$repo_root" ls-tree -r -l HEAD -- "$input")
  [ -n "$listing" ] || { echo "build input $input doesn't exist at HEAD" >&2; exit 1; }
  blobs+=$'\n'"$listing"
done
blobs=$(printf '%s\n' "$blobs" | awk -F '\t' '
  { split($1, meta, " "); if (meta[2] == "blob" && $2 !~ /\.test\.tsx?$/) print meta[3], meta[4], $2 }')

# `<logical name> <content hash>` for each file, failing on a file outside every root or two
# paths that share a logical name.
lines=""
while read -r sha size path; do
  # A Git LFS pointer is a small blob that starts with its spec's version line.
  if [ "$size" -le 1024 ]; then
    content=$(git -C "$repo_root" cat-file blob "$sha")
    if [ "${content%%$'\n'*}" = "version https://git-lfs.github.com/spec/v1" ]; then
      sha=$(printf '%s\n' "$content" | sed -n 's/^oid sha256://p')
      [ -n "$sha" ] || { echo "$path is a Git LFS pointer without an oid" >&2; exit 1; }
    fi
  fi
  # The settings file names the roots' directories: hash it with each written as its root's name,
  # longest first, so moving a root and updating its path there keeps the ID.
  if [ "$path" = "$scripts/$database/database.sh" ]; then
    content=$(git -C "$repo_root" cat-file blob "$sha")
    while read -r _ root; do
      content=${content//"${root#*=}"/"${root%%=*}"}
    done < <(for root in "${input_roots[@]}"; do
      dir=${root#*=}
      echo "${#dir} $root"
    done | sort -rn)
    sha=$(printf '%s\n' "$content" | sha256sum | cut -d ' ' -f 1)
  fi
  name="" root_length=-1
  for root in "${input_roots[@]}"; do
    dir="${root#*=}"
    case "$path" in
      "$dir"/*) if [ "${#dir}" -gt "$root_length" ]; then name="${root%%=*}${path#"$dir"}" root_length=${#dir}; fi ;;
    esac
  done
  [ -n "$name" ] || { echo "build input $path is under none of input_roots" >&2; exit 1; }
  lines+="$name $sha"$'\n'
done <<< "$blobs"
lines=$(printf '%s' "$lines" | LC_ALL=C sort -u)
duplicate=$(printf '%s\n' "$lines" | awk '{ print $1 }' | uniq -d | head -1)
[ -z "$duplicate" ] || { echo "two build inputs share the logical name $duplicate" >&2; exit 1; }
printf '%s\n' "$lines" | sha256sum | cut -c1-12
