// Signs Android release builds with our own key (owner decision, 2026-10-19:
// local builds, no EAS). The key and its password are never in the repo —
// they come from the builder's own ~/.gradle/gradle.properties:
//   PENTILIUS_STORE_FILE=C:/…/secrets/pentilius-release.keystore
//   PENTILIUS_KEY_ALIAS=pentilius
//   PENTILIUS_STORE_PASSWORD=…
//   PENTILIUS_KEY_PASSWORD=…
// Without them the release build falls back to the debug key, as before.
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_CONFIG = `
        release {
            if (project.hasProperty('PENTILIUS_STORE_FILE')) {
                storeFile file(PENTILIUS_STORE_FILE)
                storePassword PENTILIUS_STORE_PASSWORD
                keyAlias PENTILIUS_KEY_ALIAS
                keyPassword PENTILIUS_KEY_PASSWORD
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (!gradle.includes('PENTILIUS_STORE_FILE')) {
      gradle = gradle.replace(/signingConfigs \{\n/, (m) => m + RELEASE_CONFIG.slice(1) + '\n');
      gradle = gradle.replace(
        /(release \{\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/,
        "$1signingConfig project.hasProperty('PENTILIUS_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
      );
    }
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
