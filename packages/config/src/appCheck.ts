import {
  firebaseDevelopmentProjectId,
  readFirebaseEmulatorConfig,
  type FirebaseEmulatorInput,
} from './index';

export interface FirebaseBootstrapInput extends FirebaseEmulatorInput {
  projectId?: string;
}

export function readFirebaseBootstrapConfig(
  input: FirebaseBootstrapInput,
  developmentBuild: boolean,
) {
  if (input.mode === 'emulator' && developmentBuild) {
    return {
      mode: 'emulator' as const,
      projectId: firebaseDevelopmentProjectId,
      emulator: readFirebaseEmulatorConfig(input),
      appCheck: {
        apple: { provider: 'debug' as const },
        android: { provider: 'debug' as const },
        isTokenAutoRefreshEnabled: false,
      },
    };
  }
  if (
    input.mode !== 'production' ||
    developmentBuild ||
    !input.projectId ||
    input.projectId === firebaseDevelopmentProjectId ||
    !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(input.projectId) ||
    [input.host, input.authPort, input.firestorePort, input.functionsPort].some(
      (value) => Boolean(value),
    )
  ) {
    throw new Error(
      'FIREBASE_BOOTSTRAP_CONFIG_INVALID: release requires a separate production project and no emulator configuration; emulator mode requires a development build.',
    );
  }
  return {
    mode: 'production' as const,
    projectId: input.projectId,
    appCheck: {
      apple: { provider: 'appAttestWithDeviceCheckFallback' as const },
      android: { provider: 'playIntegrity' as const },
      isTokenAutoRefreshEnabled: true,
    },
  };
}
