const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
const { readFirebaseBootstrapConfig } = require('../src/appCheck.ts');
const emulator = {
  mode: 'emulator',
  host: '127.0.0.1',
  authPort: '9099',
  firestorePort: '8080',
  functionsPort: '5001',
};
test('native development keeps explicit emulator routing and debug providers without a supplied secret', () => {
  const config = readFirebaseBootstrapConfig(emulator, true);
  assert.equal(config.projectId, 'chorex-dev');
  assert.equal(config.emulator.firestorePort, 8080);
  assert.deepEqual(config.appCheck, {
    apple: { provider: 'debug' },
    android: { provider: 'debug' },
    isTokenAutoRefreshEnabled: false,
  });
});
test('release selects Apple attestation and Play Integrity, with automatic refresh', () => {
  const config = readFirebaseBootstrapConfig(
    { mode: 'production', projectId: 'chorex-release-fixture' },
    false,
  );
  assert.equal(
    config.appCheck.apple.provider,
    'appAttestWithDeviceCheckFallback',
  );
  assert.equal(config.appCheck.android.provider, 'playIntegrity');
  assert.equal(config.appCheck.isTokenAutoRefreshEnabled, true);
  assert.equal(config.emulator, undefined);
});
test('debug/emulator configuration cannot run in release; dev cannot target production', () => {
  assert.throws(() => readFirebaseBootstrapConfig(emulator, false));
  assert.throws(() =>
    readFirebaseBootstrapConfig(
      { mode: 'production', projectId: 'chorex-release-fixture' },
      true,
    ),
  );
});
test('production rejects dev project, absent/invalid project and any emulator routing', () => {
  for (const projectId of [undefined, '', 'chorex-dev', 'https://invalid'])
    assert.throws(() =>
      readFirebaseBootstrapConfig({ mode: 'production', projectId }, false),
    );
  for (const field of ['host', 'authPort', 'firestorePort', 'functionsPort'])
    assert.throws(() =>
      readFirebaseBootstrapConfig(
        {
          mode: 'production',
          projectId: 'chorex-release-fixture',
          [field]: emulator[field],
        },
        false,
      ),
    );
});
test('missing mode and nonlocal/invalid emulator configuration fail closed', () => {
  assert.throws(() => readFirebaseBootstrapConfig({}, true));
  assert.throws(() =>
    readFirebaseBootstrapConfig({ ...emulator, host: 'public.example' }, true),
  );
  assert.throws(() =>
    readFirebaseBootstrapConfig({ ...emulator, firestorePort: '0' }, true),
  );
});
