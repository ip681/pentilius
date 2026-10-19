#!/usr/bin/env bash
# Builds the signed Android APK on this machine, in Docker (owner decision,
# 2026-10-19). Run from the repository root in Git Bash:
#   bash apps/mobile/build/build-apk.sh
# Result: apps/mobile/build/out/pentilius.apk (+ a copy with the version in
# its name). The signing key and its password are read from secrets/ and only
# shown to the container — they're never copied into an image or uploaded.
set -euo pipefail
export MSYS_NO_PATHCONV=1

ROOT=$(cd "$(dirname "$0")/../../.." && pwd -W 2>/dev/null || pwd)
KEYSTORE="$ROOT/secrets/pentilius-release.keystore"
PASSWORD_FILE="$ROOT/secrets/android-keystore.txt"
OUT="$ROOT/apps/mobile/build/out"
IMAGE=pentilius-android-build

[ -f "$KEYSTORE" ] || { echo "Missing $KEYSTORE"; exit 1; }
KEYSTORE_PASSWORD=$(sed -n 's/.*password (store and key): //p' "$PASSWORD_FILE" | tr -d '\r\n')
[ -n "$KEYSTORE_PASSWORD" ] || { echo "No password in $PASSWORD_FILE"; exit 1; }
export KEYSTORE_PASSWORD

echo "== Preparing the build environment (slow only the first time)"
docker build -t "$IMAGE" \
  -f "$ROOT/apps/mobile/build/android.Dockerfile" "$ROOT/apps/mobile/build"

mkdir -p "$OUT"
echo "== Building in the container"
# Gradle and npm downloads are kept in Docker volumes, so later builds are faster.
docker run --rm \
  -e KEYSTORE_PASSWORD \
  -v "$ROOT:/src:ro" \
  -v "$KEYSTORE:/keys/release.keystore:ro" \
  -v "$OUT:/out" \
  -v pentilius-gradle-cache:/root/.gradle \
  -v pentilius-npm-cache:/root/.npm \
  "$IMAGE" bash -c "tr -d '\r' < /src/apps/mobile/build/container-build.sh | bash"
