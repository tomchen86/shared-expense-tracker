const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const mobile = path.resolve(__dirname, '../../apps/mobile');
const withAndroidBackupRules = require(
  path.join(mobile, 'plugins/android-backup-rules.cjs'),
);
const { RULES, SECURE_STORE_FILE, setBackupRules, writeBackupRules } =
  withAndroidBackupRules;
const { plugins, android } = require(path.join(mobile, 'app.json')).expo;

/** Each element of a rules file, in order, as its name and attributes. */
const elementsOf = (xml) =>
  [
    ...xml
      .replace(/<\?xml[^>]*\?>/, '')
      .matchAll(/<([a-z-]+)((?:\s+[a-z]+="[^"]*")*)\s*\/?>/g),
  ].map(([, name, attributes]) => [
    name,
    Object.fromEntries(
      [...attributes.matchAll(/([a-z]+)="([^"]*)"/g)].map(([, key, value]) => [
        key,
        value,
      ]),
    ),
  ]);

const exclusion = [
  'exclude',
  { domain: 'sharedpref', path: SECURE_STORE_FILE },
];

test('the rules name the file expo-secure-store keeps its entries in', () => {
  const module = fs.readFileSync(
    path.join(
      mobile,
      'node_modules/expo-secure-store/android/src/main/java/expo/modules/securestore/SecureStoreModule.kt',
    ),
    'utf8',
  );
  const [, name] = /SHARED_PREFERENCES_NAME = "([^"]+)"/.exec(module);

  expect(SECURE_STORE_FILE).toBe(`${name}.xml`);
  // One file holds every entry, whatever keychainService an entry is stored with.
  expect(module.match(/getSharedPreferences\((\w+),/g)).toEqual([
    'getSharedPreferences(SHARED_PREFERENCES_NAME,',
  ]);
});

test('before Android 12, a backup leaves out the secure store and nothing else', () => {
  expect(elementsOf(RULES.app_backup_rules)).toEqual([
    ['full-backup-content', {}],
    exclusion,
  ]);
});

test('from Android 12 on, a cloud backup and a device transfer each leave out the secure store and nothing else', () => {
  expect(elementsOf(RULES.app_data_extraction_rules)).toEqual([
    ['data-extraction-rules', {}],
    ['cloud-backup', {}],
    exclusion,
    ['device-transfer', {}],
    exclusion,
  ]);
});

test('no rule has an <include>, which would leave out everything it does not name', () => {
  for (const xml of Object.values(RULES)) expect(xml).not.toContain('<include');
});

test("the app's manifest points at the rules, and keeps its other attributes", () => {
  const manifest = {
    manifest: {
      application: [
        {
          $: {
            'android:name': '.MainApplication',
            'android:allowBackup': 'true',
            'android:fullBackupContent': '@xml/secure_store_backup_rules',
          },
        },
      ],
    },
  };

  expect(setBackupRules(manifest).manifest.application[0].$).toEqual({
    'android:name': '.MainApplication',
    'android:allowBackup': 'true',
    'android:fullBackupContent': '@xml/app_backup_rules',
    'android:dataExtractionRules': '@xml/app_data_extraction_rules',
  });
});

test('the rules are written among the Android project’s resources, under the names the manifest uses', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-rules-'));
  try {
    await writeBackupRules(project);
    await writeBackupRules(project);

    const directory = path.join(project, 'app/src/main/res/xml');
    expect(fs.readdirSync(directory).sort()).toEqual([
      'app_backup_rules.xml',
      'app_data_extraction_rules.xml',
    ]);
    for (const [name, xml] of Object.entries(RULES)) {
      expect(fs.readFileSync(path.join(directory, `${name}.xml`), 'utf8')).toBe(
        xml,
      );
    }
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('app.json applies these rules, and keeps expo-secure-store from writing its own', () => {
  expect(plugins).toContainEqual([
    'expo-secure-store',
    expect.objectContaining({ configureAndroidBackup: false }),
  ]);
  expect(plugins).toContain('./plugins/android-backup-rules.cjs');
  // Backups stay on: the database still has to be carried (ADR-0015).
  expect(android.allowBackup ?? true).toBe(true);
});

test('the plugin sets up both of its changes on the config', () => {
  const config = withAndroidBackupRules({ name: 'app', slug: 'app' });

  expect(Object.keys(config.mods.android).sort()).toEqual([
    'dangerous',
    'manifest',
  ]);
});
