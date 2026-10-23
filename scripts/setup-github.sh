#!/usr/bin/env bash
# One-time GitHub setup for a new repo: merge settings, labels, rulesets.
# Safe to re-run: it also brings existing rulesets back in line with the JSON. Run as the owner, from a clone after the first push: once gh's default account is the bot, GH_CONFIG_DIR=~/.config/gh-owner bash scripts/setup-github.sh
# With --check it changes nothing: it runs the same preflight, then reads the settings back.
# Exit 0 means the merge settings and rulesets are in place and active. It does not compare rule
# contents or prove behavior: the six permission checks in PLAYBOOK chapter 3 do that.
set -euo pipefail
export GH_PAGER=cat  # in a terminal, gh would otherwise stop each output in a pager
cd "$(dirname "$0")/.."
fail() { echo "setup-github: $*" >&2; exit 1; }

# Preflight: stop with the fix before changing anything.
for tool in gh git python3; do command -v "$tool" >/dev/null || fail "$tool is not installed"; done
read -r major minor < <(git --version | sed -E 's/^[^0-9]*([0-9]+)\.([0-9]+).*/\1 \2/')
[ "$major" -gt 2 ] || { [ "$major" -eq 2 ] && [ "$minor" -ge 43 ]; } ||
  fail "git $major.$minor is too old: scripts/spec-check.sh needs 2.43 or later"
read -r repo owner < <(gh repo view --json nameWithOwner,owner --jq '.nameWithOwner + " " + .owner.login') ||
  fail "this clone has no GitHub repo yet: create one and push first"
[ "$(gh api "repos/$repo" --jq .permissions.admin)" = true ] ||
  fail "gh is logged in as $(gh api user --jq .login), not an admin of $repo: run this script as $owner, for example GH_CONFIG_DIR=~/.config/gh-owner bash scripts/setup-github.sh"
names=$(for f in .github/rulesets/*.json; do python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["name"])' "$f"; done)

if [ "${1:-}" != --check ]; then
  # Squash merges only, and delete the branch once its PR merges.
  gh repo edit --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge
  # The squash commit takes the PR's title and description, which describe the final diff; the branch's commit messages may describe drafts.
  gh api -X PATCH "repos/$repo" -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY >/dev/null

  # Labels that sort release notes (.github/release.yml). --force updates existing ones.
  gh label create enhancement --color a2eeef --description "New feature or request" --force
  gh label create bug --color d73a4a --description "Something isn't working" --force
  gh label create skip-changelog --color ededed --description "Leave out of release notes" --force

  # Rulesets from .github/rulesets/: create missing ones, update existing ones to match the JSON.
  for f in .github/rulesets/*.json; do
    name=$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["name"])' "$f")
    id=$(gh api "repos/$repo/rulesets" --jq ".[] | select(.name == \"$name\") | .id")
    if [ -n "$id" ]; then
      gh api -X PUT "repos/$repo/rulesets/$id" --input "$f" >/dev/null || fail "could not update ruleset $name: see the error above"
      echo "ruleset updated: $name"
    else
      gh api -X POST "repos/$repo/rulesets" --input "$f" >/dev/null ||
        fail "could not create ruleset $name: see the error above. A private repo needs GitHub Pro or above for rulesets; otherwise make it public"
      echo "ruleset created: $name"
    fi
  done
fi

# Read back what GitHub has now.
read -r squash_only delete_branch squash_message < <(gh api "repos/$repo" --jq '"\(.allow_squash_merge and (.allow_merge_commit | not) and (.allow_rebase_merge | not)) \(.delete_branch_on_merge) \(.squash_merge_commit_title == "PR_TITLE" and .squash_merge_commit_message == "PR_BODY")"')
echo "squash merge only: $squash_only; delete branch on merge: $delete_branch; squash commit from the PR's title and description: $squash_message"
wrong=0
[ "$squash_only" = true ] && [ "$delete_branch" = true ] && [ "$squash_message" = true ] || wrong=1
# Secret scanning blocks pushes that contain keys. Free on public repos; report its state.
gh api "repos/$repo" --jq '"secret scanning: \(.security_and_analysis.secret_scanning.status // "unavailable"), push protection: \(.security_and_analysis.secret_scanning_push_protection.status // "unavailable")"'
current=$(gh api "repos/$repo/rulesets" --jq '.[] | "\(.name)\t\(.enforcement)"')
while IFS= read -r name; do
  state=$(awk -F'\t' -v n="$name" '$1 == n { print $2 }' <<<"$current")
  echo "ruleset $name: ${state:-missing}"
  [ "$state" = active ] || wrong=1
done <<<"$names"
[ "$wrong" -eq 0 ] || fail "a setting above is not what this script sets: run it without --check"
echo "Next: the six permission checks in PLAYBOOK chapter 3; record the results in the first PR's Verification section."
