// Shared by Expo prebuild and the runtime adapter; no machine-specific switches.
function crashlyticsPolicy({ mode, validation, buildProfile } = {}) {
  if (mode !== undefined && mode !== 'emulator' && mode !== 'production')
    throw new Error('CRASHLYTICS_ENVIRONMENT_INVALID');
  if (
    validation !== undefined &&
    validation !== 'false' &&
    validation !== 'true'
  )
    throw new Error('CRASHLYTICS_VALIDATION_INVALID');
  const production = mode === 'production';
  if (production && validation === 'true')
    throw new Error('CRASHLYTICS_VALIDATION_REQUIRES_DEVELOPMENT_PROJECT');
  if (buildProfile === 'production' && !production)
    throw new Error('PRODUCTION_BUILD_REQUIRES_PRODUCTION_FIREBASE_MODE');
  const enabled = production || validation === 'true';
  return {
    enabled,
    environment: production
      ? 'production'
      : validation === 'true'
        ? 'validation'
        : 'development',
    native: {
      crashlytics_auto_collection_enabled: enabled,
      crashlytics_debug_enabled: validation === 'true',
      crashlytics_is_error_generation_on_js_crash_enabled: true,
      crashlytics_javascript_exception_handler_chaining_enabled: false,
    },
  };
}
module.exports = { crashlyticsPolicy };
