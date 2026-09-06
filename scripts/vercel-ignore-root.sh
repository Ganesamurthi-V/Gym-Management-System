#!/usr/bin/env bash
#
# Vercel "Ignored Build Step" for the root Next.js project.
#
#   exit 0 -> skip the build
#   exit 1 -> run the build
#
# Wired up via "ignoreCommand" in the root vercel.json.
#
# ── WHY THIS IS NOT THE ONE-LINER THE SUB-PROJECTS USE ───────────────────────
# Every other Vercel project in this repo has its Root Directory set to its own
# folder, so it can ask "did anything under . change?" and be done. The root
# project's Root Directory *is* the repository root, so that question is always
# answered yes and the build would never skip.
#
# This asks the inverse instead: did anything outside the sibling applications
# change? Only if the answer is no does it skip.
#
# ── THE DEFAULT DIRECTION IS DELIBERATE ──────────────────────────────────────
# Anything this script does not recognise — a new top-level directory, a root
# config file, a lockfile — falls through to building. The alternative shape,
# listing the paths the Next app owns and skipping everything else, silently
# stops deploying the day someone adds a directory. A wasted build is cheap; a
# deploy that quietly never happens is not.

set -uo pipefail

# Directories deployed as their own Vercel project, plus docs, which the Next
# build never reads. Kept in sync with the "exclude" list in tsconfig.json.
UNRELATED='^(landing-page|landing-page-1|gymflow-admin|gymflow-member|gymflow-mobile|docs)/'

# No reachable parent commit: the first commit on a branch, or a clone too
# shallow to diff. Build rather than guess.
if ! git rev-parse --verify --quiet 'HEAD^' >/dev/null 2>&1; then
  echo "ignore-step: no parent commit to diff against — building."
  exit 1
fi

changed=$(git diff --name-only 'HEAD^' HEAD)

if [ -z "$changed" ]; then
  echo "ignore-step: no file changes detected — building."
  exit 1
fi

# grep exits 1 when nothing matches, and "nothing matches" is exactly the
# everything-was-unrelated case, so it must not be allowed to abort the script.
relevant=$(printf '%s\n' "$changed" | grep -Ev "$UNRELATED" || true)

if [ -z "$relevant" ]; then
  echo "ignore-step: only unrelated directories changed — skipping build."
  printf '%s\n' "$changed" | sed 's/^/  ignored: /'
  exit 0
fi

echo "ignore-step: changes affecting the app — building."
printf '%s\n' "$relevant" | sed 's/^/  /'
exit 1
