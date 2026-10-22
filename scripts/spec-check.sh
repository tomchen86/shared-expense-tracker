#!/usr/bin/env bash
# Is this PR carrying exactly the specs and acceptance tests the owner approved?
# Used by skills/review-pr, step 3.
#
#   usage: bash scripts/spec-check.sh <branch>
#   Run it in a checkout of the PR's head. The acceptance test paths are read from
#   main's AGENTS.md ("- Acceptance tests: `path`, `path`"), never from the PR's copy.
#
# The approved version is the branch spec/<branch>, which only the owner can push
# (.github/rulesets/spec-branches.json). A PR without one has nothing approved, so
# it must leave these files exactly as main has them.
#
# The head must already contain main (main-integrity requires that before merging),
# so what lands on main is the head's own tree. The approved result is main merged
# with the approved commit: merge-tree, main's attributes, no index or worktree
# touched. ok (exit 0) means that merge has no conflict in docs/specs or the
# acceptance paths, and their entries equal the head's. A conflict only elsewhere is
# code: the implementer settles it on the PR branch. Tree entries include modes and
# gitlinks regardless of the PR's diff settings. Requires Git 2.43+.
# A match verifies the files, not that the tests make sense or were run.
set -euo pipefail
[ $# -eq 1 ] || { echo "usage: spec-check.sh <branch>" >&2; exit 2; }
branch=$1
cd "$(git rev-parse --show-toplevel)"  # merge-tree lists conflicted files relative to the current directory

# One snapshot of origin's branches, matched by exact name and used by commit ID from here
# on. Names are not safe to resolve: the implementer can push a tag called origin/main,
# which git prefers to the remote branch, or a branch whose name merely ends in spec/<branch>.
heads=$(git ls-remote origin 'refs/heads/*')
tip() { awk -v ref="refs/heads/$1" '$2 == ref { print $1 }' <<<"$heads"; }
main=$(tip main); head=$(tip "$branch"); approved=spec/$branch; base=$(tip "$approved")
[ -n "$main" ] && [ -n "$head" ] || { echo "FLAG  origin has no branch main, or no branch $branch"; exit 1; }
if [ -z "$base" ]; then
  echo "note  no $approved on origin: nothing was approved, so $branch must leave these files exactly as main has them"
  approved=main; base=$main
fi
git fetch -q --no-tags origin "$main" "$base" "$head"

# The acceptance test paths come from main's AGENTS.md, since the PR can edit its own copy,
# and a path left out by hand would simply not be compared.
acceptance=$(git show "$main:AGENTS.md" | sed -n 's/^- Acceptance tests: //p' | grep -o '`[^`]*`' | tr -d '`' || true)
# One path per pair of backticks, kept whole: splitting at a space, or expanding a glob against
# the PR head's own files, could leave the listed path out of the comparison without an error.
set --
while IFS= read -r path; do [ -z "$path" ] || set -- "$@" "$path"; done <<<"$acceptance"
[ $# -ge 1 ] || { echo "FLAG  AGENTS.md on main has no '- Acceptance tests:' line listing paths in backticks"; exit 1; }
paths=(docs/specs "$@")

# What gets compared must be what gets reviewed, and later merged with --match-head-commit.
[ "$(git rev-parse HEAD)" = "$head" ] ||
  { echo "FLAG  the commit checked out here is not the head of $branch: check the PR out again and review that commit"; exit 1; }

# Only a head that already contains main lands on main as its own tree.
git merge-base --is-ancestor "$main" "$head" ||
  { echo "FLAG  $branch is behind main: gh pr update-branch, then review the new head. Conflicts in docs/specs or acceptance tests go to the spec author, code conflicts to the implementer"; exit 1; }

# Read literal paths from the repo root, even when called from a subdirectory.
files() { git --literal-pathspecs -c core.quotePath=false ls-tree -r --full-tree "$1" -- "${paths[@]}"; }
differing() { diff <(printf '%s\n' "$1") <(printf '%s\n' "$2") | sed -n $'s/^[<>] [^\t]*\t/      /p' | sort -u; }  # for display
in_paths() { local p; for p in "${paths[@]}"; do p=${p%/}; [[ $1 == "$p" || $1 == "$p"/* ]] && return 0; done; return 1; }
approved_tree() {  # main merged with the approved commit, using main's attributes
  local out status=0 f
  out=$(git --attr-source="$main" -c core.quotePath=false merge-tree --write-tree --name-only --no-messages "$main" "$base") || status=$?
  # Exit 1 lists the conflicted files after the tree ID. If none is in the compared paths, those
  # files merged cleanly and the conflict is the implementer's: compare the tree anyway.
  if [ "$status" -eq 1 ]; then
    status=0
    while IFS= read -r f; do if in_paths "$f"; then status=1; fi; done <<<"$(tail -n +2 <<<"$out")"
  fi
  [ "$status" -ne 0 ] || { head -n 1 <<<"$out"; return; }
  echo "FLAG  cannot merge $approved into main; the spec author resolves the error or conflict on $approved first:" >&2
  tail -n +2 <<<"$out" >&2
  return 1
}

# A path that exists nowhere, such as a mistyped one, would compare nothing and pass.
# An approved removal of the last test still passes: main still has the path.
for path in "$@"; do
  [ -n "$(for commit in "$main" "$base" "$head"; do git --literal-pathspecs ls-tree --full-tree "$commit" -- "$path"; done)" ] ||
    { echo "FLAG  '$path' is on neither main, $approved, nor $branch: fix the Acceptance tests line in AGENTS.md on main"; exit 1; }
done
want_tree=$(approved_tree)
want=$(files "$want_tree"); got=$(files "$head")
compared="$branch $head against $approved $base on main $main"
if [ "$want" = "$got" ]; then
  echo "ok    $compared"
else
  echo "FLAG  $compared: these files are not what was approved"
  differing "$want" "$got" || true
  exit 1
fi
