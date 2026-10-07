#!/usr/bin/env bash
# Publish dist/ to the gh-pages branch by hand (the "Publish site" workflow does the same on every push to main).
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
sha=$(git -C "$root" rev-parse --short HEAD)
out=$(mktemp -d)
cp -a "$root/dist/." "$out/"
cd "$out"
git init -q -b gh-pages
git config user.name "$(git -C "$root" config user.name)"
git config user.email "$(git -C "$root" config user.email)"
git add -A
git commit -q -m "Publish dist/ from main ($sha)"
git push -q -f "$(git -C "$root" remote get-url origin)" gh-pages
echo "published $sha"
