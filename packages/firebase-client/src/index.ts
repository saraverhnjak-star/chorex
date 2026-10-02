import { getApp } from '@react-native-firebase/app';
import { connectAuthEmulator, getAuth } from '@react-native-firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
} from '@react-native-firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
} from '@react-native-firebase/functions';
import {
  firebaseDevelopmentProjectId,
  readFirebaseEmulatorConfig,
  type FirebaseEmulatorInput,
} from '@chorex/config';

interface DevelopmentFirebase {
  app: ReturnType<typeof getApp>;
  auth: ReturnType<typeof getAuth>;
  firestore: ReturnType<typeof getFirestore>;
  functions: ReturnType<typeof getFunctions>;
}

interface SetupState {
  fingerprint: string;
  services?: DevelopmentFirebase;
  failure?: Error;
}

// Persist across module re-evaluation/Fast Refresh. Never repeat partial setup.
const registry = globalThis as typeof globalThis & {
  __chorexDevelopmentFirebase?: SetupState;
};

export function initializeDevelopmentFirebase(
  input: FirebaseEmulatorInput,
): DevelopmentFirebase {
  const config = readFirebaseEmulatorConfig(input);
  const app = getApp();
  if (app.options.projectId !== firebaseDevelopmentProjectId) {
    throw new Error(
      'FIREBASE_PROJECT_MISMATCH: native configuration must identify chorex-dev.',
    );
  }
  const fingerprint = JSON.stringify({
    projectId: app.options.projectId,
    ...config,
  });
  const previous = registry.__chorexDevelopmentFirebase;
  if (previous) {
    if (previous.fingerprint !== fingerprint) {
      throw new Error(
        'FIREBASE_EMULATOR_CONFIG_CHANGED: restart the native app after changing emulator settings.',
      );
    }
    if (previous.failure) throw previous.failure;
    if (previous.services) return previous.services;
    throw new Error('FIREBASE_SETUP_INCOMPLETE: restart the native app.');
  }
  const state: SetupState = { fingerprint };
  registry.__chorexDevelopmentFirebase = state;
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${config.host}:${config.authPort}`);
    const firestore = getFirestore(app);
    connectFirestoreEmulator(firestore, config.host, config.firestorePort);
    const functions = getFunctions(app);
    connectFunctionsEmulator(functions, config.host, config.functionsPort);
    state.services = { app, auth, firestore, functions };
    // IDs/host routing only; never log configuration files, credentials, or tokens.
    console.info(
      `Firebase emulator setup ready: ${firebaseDevelopmentProjectId} at ${config.host}`,
    );
    return state.services;
  } catch (error) {
    state.failure =
      error instanceof Error ? error : new Error('FIREBASE_SETUP_FAILED');
    throw state.failure;
  }
}
