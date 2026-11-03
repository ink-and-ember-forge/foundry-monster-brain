#!/usr/bin/env bash
# Usage: package-release.sh <tag e.g. v0.1.0> <owner/repo>
# Stamps the tag's version into module.json and zips only what Foundry needs.
set -euo pipefail
TAG="$1"; REPO="$2"; VERSION="${TAG#v}"
rm -rf dist && mkdir -p dist/stage
jq --arg v "$VERSION" --arg repo "$REPO" --arg tag "$TAG" '
  .version = $v
  | .url = "https://github.com/\($repo)"
  | .manifest = "https://github.com/\($repo)/releases/latest/download/module.json"
  | .download = "https://github.com/\($repo)/releases/download/\($tag)/module.zip"
' module.json > dist/module.json
cp dist/module.json dist/stage/module.json
cp -r scripts styles lang dist/stage/
rm -f dist/stage/scripts/package-release.sh
[ -f LICENSE ] && cp LICENSE dist/stage/ || true
(cd dist/stage && zip -qr ../module.zip .)
rm -rf dist/stage
echo "Built dist/module.json and dist/module.zip for $VERSION"
