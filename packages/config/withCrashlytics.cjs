const {
  withDangerousMod,
  withXcodeProject,
  withPodfile,
} = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
const { crashlyticsPolicy } = require('./crashlytics.cjs');

// RNFB reads app-root firebase.json during native builds. Generated, never secret.
// This file is distinct from the repository's backend Firebase CLI configuration.
module.exports = function withCrashlyticsPolicy(config, options) {
  const policy = crashlyticsPolicy(options);
  config.extra = {
    ...config.extra,
    observability: {
      enabled: policy.enabled,
      environment: policy.environment,
    },
  };
  for (const platform of ['ios', 'android']) {
    config = withDangerousMod(config, [
      platform,
      async (mod) => {
        // Validate app registration without copying native Firebase identifiers into JS.
        const nativeFile =
          platform === 'ios'
            ? config.ios?.googleServicesFile
            : config.android?.googleServicesFile;
        if (!nativeFile)
          throw new Error('CRASHLYTICS_NATIVE_FIREBASE_FILE_REQUIRED');
        const contents = fs.readFileSync(
          path.resolve(mod.modRequest.projectRoot, nativeFile),
          'utf8',
        );
        const expectedProject =
          policy.environment === 'production'
            ? options.projectId
            : 'chorex-dev';
        if (
          !expectedProject ||
          (policy.environment === 'production' &&
            expectedProject === 'chorex-dev')
        )
          throw new Error('FIREBASE_PROJECT_MISMATCH');
        if (platform === 'ios') {
          const bundle = contents.match(
            /<key>BUNDLE_ID<\/key>\s*<string>([^<]+)<\/string>/,
          )?.[1];
          const projectId = contents.match(
            /<key>PROJECT_ID<\/key>\s*<string>([^<]+)<\/string>/,
          )?.[1];
          if (projectId !== expectedProject)
            throw new Error('FIREBASE_PROJECT_MISMATCH');
          if (bundle !== config.ios.bundleIdentifier)
            throw new Error('FIREBASE_APP_VARIANT_MISMATCH');
          // RNFB 26.4.0's SPM symbol uploader expects this root-level plist.
          fs.copyFileSync(
            path.resolve(mod.modRequest.projectRoot, nativeFile),
            path.join(
              mod.modRequest.platformProjectRoot,
              'GoogleService-Info.plist',
            ),
          );
        } else {
          const data = JSON.parse(contents);
          if (data.project_info?.project_id !== expectedProject)
            throw new Error('FIREBASE_PROJECT_MISMATCH');
          const clients = data.client ?? [];
          if (
            !clients.some(
              (client) =>
                client.client_info?.android_client_info?.package_name ===
                config.android.package,
            )
          )
            throw new Error('FIREBASE_APP_VARIANT_MISMATCH');
        }
        const target = path.join(mod.modRequest.projectRoot, 'firebase.json');
        fs.writeFileSync(
          target,
          JSON.stringify({ 'react-native': policy.native }, null, 2) + '\n',
        );
        return mod;
      },
    ]);
  }
  config = withPodfile(config, (mod) => {
    const hook =
      '\n# ChoreX: validate Debug symbols locally; retain RNFB automatic Release upload.\npost_integrate do |installer|\n  installer.aggregate_targets.map(&:user_project).compact.uniq.each do |project|\n    project.native_targets.each do |target|\n      target.shell_script_build_phases.each do |phase|\n        next unless phase.name == \'[CP-User] [RNFB] Crashlytics Configuration\'\n        next if phase.shell_script.include?(\'ChoreX Debug symbol validation\')\n        phase.shell_script = <<~\'SH\' + phase.shell_script\n          # ChoreX Debug symbol validation (no remote upload)\n          if [ "${CONFIGURATION}" = "Debug" ]; then\n            uploader="${PODS_ROOT}/FirebaseCrashlytics/upload-symbols"\n            if [ ! -x "$uploader" ]; then\n              uploader="${BUILD_DIR%Build/*}SourcePackages/checkouts/firebase-ios-sdk/Crashlytics/upload-symbols"\n            fi\n            "$uploader" --validate -gsp "${PROJECT_DIR}/GoogleService-Info.plist" -p ios "${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}"\n            exit "$?"\n          fi\n        SH\n        phase.input_paths |= [\n          \'${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}/Contents/Info.plist\',\n          \'${PROJECT_DIR}/GoogleService-Info.plist\',\n          \'$(TARGET_BUILD_DIR)/$(EXECUTABLE_PATH)\'\n        ]\n      end\n    end\n    project.save\n  end\nend\n';
    if (
      !mod.modResults.contents.includes(
        '# ChoreX: validate Debug symbols locally',
      )
    )
      mod.modResults.contents += hook;
    return mod;
  });
  return withXcodeProject(config, (mod) => {
    // The installed SPM uploader requires app dSYMs, including validation Debug builds.
    for (const build of Object.values(
      mod.modResults.pbxXCBuildConfigurationSection(),
    )) {
      if (build && typeof build === 'object' && build.buildSettings)
        build.buildSettings.DEBUG_INFORMATION_FORMAT = '"dwarf-with-dsym"';
    }
    return mod;
  });
};
