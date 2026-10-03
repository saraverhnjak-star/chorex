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
  doc,
  getDoc,
  getFirestore,
} from '@react-native-firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from '@react-native-firebase/functions';
import {
  createFamilyInputSchema,
  createFamilyOutputSchema,
  familyCommandErrorCodes,
  persistedParentProfileSchema,
  type CreateFamilyInputValue,
  type CreateFamilyOutput,
  type FamilyCommandErrorCode,
  type PersistedParentProfile,
} from '@chorex/domain';
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

export const familyClientErrorCodes = {
  ...familyCommandErrorCodes,
  networkUnavailable: 'NETWORK_UNAVAILABLE',
  profileReadFailed: 'PROFILE_READ_FAILED',
  unknown: 'UNKNOWN_FAMILY_FAILURE',
} as const;

export type FamilyClientErrorCode =
  (typeof familyClientErrorCodes)[keyof typeof familyClientErrorCodes];

export class FamilyClientError extends Error {
  constructor(readonly code: FamilyClientErrorCode) {
    super(code);
    this.name = 'FamilyClientError';
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

function getInitializedFirestore() {
  const state = registry.__chorexDevelopmentFirebase;
  if (state?.services) return state.services.firestore;
  if (state?.failure) throw state.failure;
  throw new Error(
    'FIREBASE_SETUP_REQUIRED: initialize development Firebase before using Firestore.',
  );
}

function getInitializedFunctions() {
  const state = registry.__chorexDevelopmentFirebase;
  if (state?.services) return state.services.functions;
  if (state?.failure) throw state.failure;
  throw new Error(
    'FIREBASE_SETUP_REQUIRED: initialize development Firebase before using Functions.',
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

function readStableFamilyErrorCode(
  error: unknown,
): FamilyCommandErrorCode | undefined {
  if (typeof error !== 'object' || error === null || !('details' in error)) {
    return undefined;
  }
  const details = error.details;
  if (typeof details !== 'object' || details === null || !('code' in details)) {
    return undefined;
  }
  const code = details.code;
  return Object.values(familyCommandErrorCodes).find((value) => value === code);
}

function translateFamilyError(error: unknown): FamilyClientError {
  if (error instanceof FamilyClientError) return error;
  const stableCode = readStableFamilyErrorCode(error);
  if (stableCode) return new FamilyClientError(stableCode);
  const providerCode = readProviderErrorCode(error);
  if (
    providerCode === 'functions/unavailable' ||
    providerCode === 'firestore/unavailable' ||
    providerCode === 'firestore/network-request-failed'
  ) {
    return new FamilyClientError(familyClientErrorCodes.networkUnavailable);
  }
  return new FamilyClientError(familyClientErrorCodes.unknown);
}

function timestampToIso(value: unknown): string {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('toDate' in value) ||
    typeof value.toDate !== 'function'
  ) {
    throw new FamilyClientError(familyClientErrorCodes.profileReadFailed);
  }
  const date = value.toDate();
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) {
    throw new FamilyClientError(familyClientErrorCodes.profileReadFailed);
  }
  return date.toISOString();
}

export function isFamilyClientError(
  error: unknown,
): error is FamilyClientError {
  return error instanceof FamilyClientError;
}

export async function readCurrentParentProfile(): Promise<PersistedParentProfile | null> {
  const user = getInitializedAuth().currentUser;
  if (!user) {
    throw new FamilyClientError(familyClientErrorCodes.authRequired);
  }
  try {
    const snapshot = await getDoc(
      doc(getInitializedFirestore(), 'users', user.uid),
    );
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    if (data.accountType === 'CHILD') {
      throw new FamilyClientError(familyClientErrorCodes.wrongActorRole);
    }
    return persistedParentProfileSchema.parse({
      uid: user.uid,
      displayName: data.displayName,
      accountType: data.accountType,
      createdAt: timestampToIso(data.createdAt),
    });
  } catch (error) {
    if (error instanceof FamilyClientError) throw error;
    if (typeof error === 'object' && error !== null && 'issues' in error) {
      throw new FamilyClientError(familyClientErrorCodes.profileReadFailed);
    }
    throw translateFamilyError(error);
  }
}

export async function createFamily(
  rawInput: CreateFamilyInputValue,
): Promise<CreateFamilyOutput> {
  const parsedInput = createFamilyInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new FamilyClientError(familyClientErrorCodes.invalidInput);
  }
  try {
    const callable = httpsCallable<typeof parsedInput.data, unknown>(
      getInitializedFunctions(),
      'createFamily',
    );
    const result = await callable(parsedInput.data);
    return createFamilyOutputSchema.parse(result.data);
  } catch (error) {
    throw translateFamilyError(error);
  }
}
