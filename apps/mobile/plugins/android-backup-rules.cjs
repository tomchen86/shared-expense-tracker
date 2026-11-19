// Android's backup rules for the app (ADR-0015, SHARING-43.1). Auto Backup and device
// transfer carry everything the app keeps, the database among it, except the file where
// expo-secure-store keeps its entries: a seed restored to another phone would make that
// phone the same device. expo-secure-store's own rules, which this takes the place of,
// would carry shared preferences only, and so leave the database behind.
const fs = require('node:fs');
const path = require('node:path');
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require('expo/config-plugins');

/** The shared preferences file of expo-secure-store, as a backup rule names it. */
const SECURE_STORE_FILE = 'SecureStore.xml';
// An exclusion and no <include>: whatever a rule does not name stays in.
const EXCLUDE = `<exclude domain="sharedpref" path="${SECURE_STORE_FILE}"/>`;

/** Each rules file in `res/xml`, by its resource name. */
const RULES = {
  // Android 11 and lower.
  app_backup_rules: `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  ${EXCLUDE}
</full-backup-content>
`,
  // Android 12 and higher.
  app_data_extraction_rules: `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    ${EXCLUDE}
  </cloud-backup>
  <device-transfer>
    ${EXCLUDE}
  </device-transfer>
</data-extraction-rules>
`,
};

/** Points the app's manifest at the rules. */
function setBackupRules(androidManifest) {
  const application =
    AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  application.$['android:fullBackupContent'] = '@xml/app_backup_rules';
  application.$['android:dataExtractionRules'] =
    '@xml/app_data_extraction_rules';
  return androidManifest;
}

/** Writes the rules among the resources of the Android project at `androidRoot`. */
async function writeBackupRules(androidRoot) {
  const directory = path.join(androidRoot, 'app/src/main/res/xml');
  await fs.promises.mkdir(directory, { recursive: true });
  for (const [name, xml] of Object.entries(RULES)) {
    await fs.promises.writeFile(path.join(directory, `${name}.xml`), xml);
  }
}

function withAndroidBackupRules(config) {
  return withDangerousMod(
    withAndroidManifest(config, (manifest) => {
      manifest.modResults = setBackupRules(manifest.modResults);
      return manifest;
    }),
    [
      'android',
      async (project) => {
        await writeBackupRules(project.modRequest.platformProjectRoot);
        return project;
      },
    ],
  );
}

module.exports = withAndroidBackupRules;
Object.assign(module.exports, {
  RULES,
  SECURE_STORE_FILE,
  setBackupRules,
  writeBackupRules,
});
