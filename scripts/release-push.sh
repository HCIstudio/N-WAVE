#!/usr/bin/env bash
# The last git step of a release (release.yml): commit the version bump on top
# of the commit the release was built from, tag that commit, and push the tag
# and main together, in one atomic push.
#
#   scripts/release-push.sh <version> [remote] [branch]
#
# Run in a checkout of the released commit, with the version already written
# into frontend/package.json and backend/package.json.
#
# The tag always names exactly what was built (the released code with its
# version). If main moved on while the release was built (a pull request was
# merged meanwhile), the version commit goes on top of the newer main and the
# push is tried again. If it can't go on top (a newer pull request set the
# version by hand), only the tag is pushed: main keeps that pull request's
# version, and the next release continues from it.
set -euo pipefail

version="$1"
remote="${2:-origin}"
branch="${3:-main}"
tag="v${version}"

git add frontend/package.json backend/package.json
if git diff --cached --quiet; then
  # A version set by hand in the pull request is in package.json already.
  echo "package.json files already at ${tag}; tagging only"
  git tag "$tag"
  git push "$remote" "refs/tags/${tag}"
  exit 0
fi

git commit -q -m "chore(release): ${tag}"
git tag "$tag"

for attempt in 1 2 3 4 5; do
  if git push --atomic "$remote" "HEAD:refs/heads/${branch}" "refs/tags/${tag}"; then
    exit 0
  fi
  echo "${branch} moved on while ${tag} was built; putting the version commit on top of it (attempt ${attempt})"
  git fetch -q "$remote" "$branch"
  if ! git rebase -q "${remote}/${branch}"; then
    git rebase --abort
    echo "::warning::The version commit doesn't apply on top of ${branch} (a newer pull request sets the version?). Pushing only the tag ${tag}."
    git push "$remote" "refs/tags/${tag}"
    exit 0
  fi
  sleep $((attempt * 2))
done

echo "::error::Could not push ${tag} and the version commit to ${branch}."
exit 1
