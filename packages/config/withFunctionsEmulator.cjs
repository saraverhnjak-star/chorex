const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const marker = '// ChoreX local Functions transport';
const block = `
    ${marker}
    #if DEBUG
    if Bundle.main.object(forInfoDictionaryKey: "ChoreXFirebaseMode") as? String == "emulator",
       let app = FirebaseApp.app(), app.options.projectID == "chorex-dev" {
      Functions.functions(app: app, region: "us-central1").allowInsecureTokenAttachment = true
    }
    #endif
`;

function configureSwift(contents) {
  if (contents.includes(marker)) return contents;
  if (!contents.includes('FirebaseApp.configure()'))
    throw new Error('FUNCTIONS_EMULATOR_FIREBASE_CONFIGURATION_REQUIRED');
  if (!contents.includes('import FirebaseFunctions'))
    contents = 'import FirebaseFunctions\n' + contents;
  return contents.replace(
    'FirebaseApp.configure()',
    'FirebaseApp.configure()' + block,
  );
}

module.exports = function withFunctionsEmulator(config, options = {}) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.ChoreXFirebaseMode =
      options.mode === 'emulator' ? 'emulator' : 'off';
    return mod;
  });
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift')
      throw new Error('FUNCTIONS_EMULATOR_SWIFT_APP_DELEGATE_REQUIRED');
    mod.modResults.contents = configureSwift(mod.modResults.contents);
    return mod;
  });
};
module.exports.configureSwift = configureSwift;
