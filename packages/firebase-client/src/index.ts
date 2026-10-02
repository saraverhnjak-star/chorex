import { getApp } from '@react-native-firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword as firebaseCreateUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  signInWithEmailAndPassword as firebaseSignInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from '@react-native-firebase/auth';
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

export const authErrorCodes = {
  invalidCredentials: 'INVALID_CREDENTIALS',
  invalidEmail: 'INVALID_EMAIL',
  emailAlreadyInUse: 'EMAIL_ALREADY_IN_USE',
  weakPassword: 'WEAK_PASSWORD',
  tooManyAttempts: 'TOO_MANY_ATTEMPTS',
  networkUnavailable: 'NETWORK_UNAVAILABLE',
  unknown: 'UNKNOWN_AUTH_FAILURE',
} as const;

export type AuthErrorCode =
  (typeof authErrorCodes)[keyof typeof authErrorCodes];

export interface AuthUser {
  readonly uid: string;
  readonly email: string | null;
}

export interface AuthCredentials {
  readonly email: string;
  readonly password: string;
}

export class AuthClientError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
    this.name = 'AuthClientError';
  }
}

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

function getInitializedAuth() {
  const state = registry.__chorexDevelopmentFirebase;
  if (state?.services) return state.services.auth;
  if (state?.failure) throw state.failure;
  throw new Error(
    'FIREBASE_SETUP_REQUIRED: initialize development Firebase before using Auth.',
  );
}

function toAuthUser(user: Pick<User, 'uid' | 'email'>): AuthUser {
  return { uid: user.uid, email: user.email };
}

function readProviderErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  return typeof error.code === 'string' ? error.code : undefined;
}

function translateAuthError(error: unknown): AuthClientError {
  if (error instanceof AuthClientError) return error;
  switch (readProviderErrorCode(error)) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return new AuthClientError(authErrorCodes.invalidCredentials);
    case 'auth/invalid-email':
      return new AuthClientError(authErrorCodes.invalidEmail);
    case 'auth/email-already-in-use':
      return new AuthClientError(authErrorCodes.emailAlreadyInUse);
    case 'auth/weak-password':
      return new AuthClientError(authErrorCodes.weakPassword);
    case 'auth/too-many-requests':
      return new AuthClientError(authErrorCodes.tooManyAttempts);
    case 'auth/network-request-failed':
      return new AuthClientError(authErrorCodes.networkUnavailable);
    default:
      return new AuthClientError(authErrorCodes.unknown);
  }
}

export function isAuthClientError(error: unknown): error is AuthClientError {
  return error instanceof AuthClientError;
}

export function observeAuthState(
  listener: (user: AuthUser | null) => void,
  onError: (error: AuthClientError) => void,
): () => void {
  try {
    return firebaseOnAuthStateChanged(
      getInitializedAuth(),
      (user) => listener(user ? toAuthUser(user) : null),
      (error) => onError(translateAuthError(error)),
    );
  } catch (error) {
    onError(translateAuthError(error));
    return () => undefined;
  }
}

export async function registerWithEmailAndPassword(
  credentials: AuthCredentials,
): Promise<AuthUser> {
  try {
    const result = await firebaseCreateUserWithEmailAndPassword(
      getInitializedAuth(),
      credentials.email,
      credentials.password,
    );
    return toAuthUser(result.user);
  } catch (error) {
    throw translateAuthError(error);
  }
}

export async function signInWithEmailAndPassword(
  credentials: AuthCredentials,
): Promise<AuthUser> {
  try {
    const result = await firebaseSignInWithEmailAndPassword(
      getInitializedAuth(),
      credentials.email,
      credentials.password,
    );
    return toAuthUser(result.user);
  } catch (error) {
    throw translateAuthError(error);
  }
}

export async function signOutCurrentUser(): Promise<void> {
  try {
    await firebaseSignOut(getInitializedAuth());
  } catch (error) {
    throw translateAuthError(error);
  }
}
