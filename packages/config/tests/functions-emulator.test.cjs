const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let plist;
let delegate;
Module._load = function (request, ...args) {
  if (request === 'expo/config-plugins')
    return {
      withInfoPlist: (config, action) => {
        plist = action;
        return config;
      },
      withAppDelegate: (config, action) => {
        delegate = action;
        return config;
      },
    };
  return originalLoad.call(this, request, ...args);
};
const plugin = require('../withFunctionsEmulator.cjs');
Module._load = originalLoad;

test('only explicit emulator builds opt in; production, missing and unknown modes fail closed', () => {
  for (const mode of ['emulator', 'production', undefined, 'validation']) {
    plugin({}, { mode });
    const result = plist({ modResults: { ChoreXFirebaseMode: 'emulator' } });
    assert.equal(
      result.modResults.ChoreXFirebaseMode,
      mode === 'emulator' ? 'emulator' : 'off',
    );
  }
});

test('native opt-in requires Debug, emulator mode and the development project after Firebase setup', () => {
  plugin({}, { mode: 'emulator' });
  const input = 'import FirebaseCore\nFirebaseApp.configure()\n';
  const output = delegate({
    modResults: { language: 'swift', contents: input },
  }).modResults.contents;
  assert.match(
    output,
    /#if DEBUG[\s\S]*ChoreXFirebaseMode[\s\S]*== "emulator"[\s\S]*projectID == "chorex-dev"[\s\S]*allowInsecureTokenAttachment = true[\s\S]*#endif/,
  );
  assert.ok(
    output.indexOf('FirebaseApp.configure()') <
      output.indexOf('allowInsecureTokenAttachment'),
  );
  assert.equal(plugin.configureSwift(output), output);
});

test('unsupported native entry points stop generation rather than silently omit the guard', () => {
  plugin({});
  assert.throws(
    () => delegate({ modResults: { language: 'objc', contents: '' } }),
    /SWIFT_APP_DELEGATE_REQUIRED/,
  );
  assert.throws(
    () => plugin.configureSwift('import FirebaseCore'),
    /FIREBASE_CONFIGURATION_REQUIRED/,
  );
});
