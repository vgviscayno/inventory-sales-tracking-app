#!/usr/bin/env bash
# Read-only checks for the invariants in docs/git-workflow.md. Never mutates.
set -euo pipefail

git fetch --quiet --all --prune 2>/dev/null || true

# Prefer a local branch; fall back to its origin tracking ref.
resolve() {
  if git show-ref --verify --quiet "refs/heads/$1"; then
    echo "$1"
  else
    echo "origin/$1"
  fi
}

MAIN=$(resolve main)
DEV=$(resolve dev)

fail=0

echo "== main is a fast-forward ancestor of dev =="
if git merge-base --is-ancestor "$MAIN" "$DEV" 2>/dev/null; then
  echo "PASS"
else
  echo "FAIL — main has commits dev doesn't. 'git log $DEV..$MAIN' to see them."
  fail=1
fi
echo

echo "== branches with no live project/* branch as an ancestor (needs a human look) =="
project_branches=$(git for-each-ref --format='%(refname:short)' refs/heads/project refs/remotes/origin/project 2>/dev/null | sed 's#^origin/##' | sort -u)

if [ -z "$project_branches" ]; then
  echo "No project branches found — nothing to check."
else
  other_branches=$(git for-each-ref --format='%(refname:short)' refs/heads refs/remotes/origin \
    | sed 's#^origin/##' \
    | grep -vE '^(main|dev|HEAD)$' \
    | grep -v '^project/' \
    | sort -u)

  any_candidate=0
  for b in $other_branches; do
    based_on_a_project=0
    for p in $project_branches; do
      if git merge-base --is-ancestor "$p" "$b" 2>/dev/null; then
        based_on_a_project=1
        break
      fi
    done
    # Not based on any live project branch. This is a heuristic, not proof: a
    # branch cut straight from dev (escape hatch, pre-build discovery) looks
    # the same once dev has moved on past where it was cut. Report it as a
    # candidate for a human to check against Linear, don't fail the audit on it.
    if [ "$based_on_a_project" -eq 0 ]; then
      echo "CANDIDATE — $b (no live project/* branch is an ancestor)"
      any_candidate=1
    fi
  done
  [ "$any_candidate" -eq 0 ] && echo "None found."
fi
echo

if [ "$fail" -ne 0 ]; then
  echo "One or more checks failed — see above."
  exit 1
fi
echo "All checks passed."
