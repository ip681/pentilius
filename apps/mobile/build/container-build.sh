#!/usr/bin/env bash
# Runs INSIDE the build container (see build-apk.sh). The repository is
# mounted read-only at /src; the app is copied to /work so the Windows
# node_modules and generated folders are never touched or reused.
set -euo pipefail

echo "== Copying the app"
mkdir -p /work/apps /work/packages
rm -rf /work/apps/mobile /work/packages/shared
cp -r /src/packages/shared /work/packages/shared
rm -rf /work/packages/shared/node_modules
mkdir -p /work/apps/mobile
(cd /src/apps/mobile && tar --exclude=node_modules --exclude=android --exclude=ios --exclude=.expo --exclude=build/out -cf - .) | (cd /work/apps/mobile && tar -xf -)
cd /work/apps/mobile

echo "== Installing packages"
npm ci --no-audit --no-fund

# Each build gets a higher version code (minutes since 2026-01-01), so it installs over the previous one.
VERSION_CODE=$(( ($(date +%s) - 1767225600) / 60 ))
node -e "const fs=require('fs');const a=JSON.parse(fs.readFileSync('app.json','utf8'));a.expo.android.versionCode=$VERSION_CODE;fs.writeFileSync('app.json',JSON.stringify(a,null,2))"
VERSION=$(node -p "require('./app.json').expo.version")
echo "== Version $VERSION ($VERSION_CODE)"

echo "== Generating the Android project"
npx expo prebuild --platform android --no-install

echo "== Building the APK (the longest step)"
cd android
NODE_ENV=production ./gradlew assembleRelease --console=plain --build-cache \
  -PreactNativeArchitectures=arm64-v8a,armeabi-v7a \
  -PPENTILIUS_STORE_FILE=/keys/release.keystore \
  -PPENTILIUS_KEY_ALIAS=pentilius \
  -PPENTILIUS_STORE_PASSWORD="$KEYSTORE_PASSWORD" \
  -PPENTILIUS_KEY_PASSWORD="$KEYSTORE_PASSWORD"

cp app/build/outputs/apk/release/app-release.apk "/out/pentilius-$VERSION-$VERSION_CODE.apk"
cp app/build/outputs/apk/release/app-release.apk /out/pentilius.apk
# Uploaded next to the APK: the app compares it with its own version and offers the update.
printf '{"version":"%s","versionCode":%s}\n' "$VERSION" "$VERSION_CODE" > /out/version.json
echo "== Done: pentilius-$VERSION-$VERSION_CODE.apk ($(du -h /out/pentilius.apk | cut -f1))"
